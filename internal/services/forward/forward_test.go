package forward

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"sync/atomic"
	"testing"
	"time"

	"github.com/connor-davis/tailshare/internal/platform/config"
	"github.com/connor-davis/tailshare/internal/services/peer"
	"github.com/connor-davis/tailshare/internal/services/session"
	"github.com/connor-davis/tailshare/internal/testsupport/tailcattest"
)

func TestMain(tests *testing.M) { tailcattest.Init(); os.Exit(tests.Run()) }

type member struct {
	sess *session.Session
	fwd  *Forwards
}

// startRoom builds a two-member room: the first member is older, the second dialed it.
func startRoom(t *testing.T) (older, newer *member) {
	t.Helper()
	derp := tailcattest.ServeMap(t, tailcattest.LocalDERP(t))
	cfg := config.Config{Region: tailcattest.RegionID, DERPMapURL: derp}

	join := func(code string) *member {
		fwd := New(nil)
		ctx, cancel := context.WithTimeout(t.Context(), 40*time.Second)
		defer cancel()
		options := session.Options{RoomHandlers: fwd.RoomHandlers()}
		sess, err := session.Join(ctx, code, cfg, "Newer", options)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { fwd.Close(); _ = sess.Close() })
		return &member{sess: sess, fwd: fwd}
	}
	attach := func(m *member) {
		if err := m.fwd.Attach(m.sess); err != nil {
			t.Fatal(err)
		}
		go func() {
			for {
				select {
				case <-m.sess.Changes():
					m.fwd.Sync()
				case <-m.sess.Done():
					return
				}
			}
		}()
	}

	fwd := New(nil)
	opts := session.Options{RoomHandlers: fwd.RoomHandlers()}
	host, code, err := session.Host(t.Context(), cfg, "Older", opts)
	if err != nil {
		t.Fatal(err)
	}
	older = &member{sess: host, fwd: fwd}
	t.Cleanup(func() { fwd.Close(); _ = host.Close() })
	attach(older)

	joined := make(chan *member, 1)
	go func() { joined <- join(code.String()) }()
	eventually(t, func() bool {
		pending, ok := host.Pending()
		if ok {
			_ = host.Allow(pending.ID)
		}
		return len(host.Members()) == 2
	})
	newer = <-joined
	attach(newer)

	eventually(t, func() bool {
		_, a := older.sess.Control(newer.sess.SelfID())
		_, b := newer.sess.Control(older.sess.SelfID())
		return a && b
	})
	return older, newer
}

func eventually(t *testing.T, check func() bool) {
	t.Helper()
	deadline := time.Now().Add(30 * time.Second)
	for !check() {
		if time.Now().After(deadline) {
			t.Fatal("condition not reached in time")
		}
		time.Sleep(50 * time.Millisecond)
	}
}

func portOf(t *testing.T, address string) int {
	t.Helper()
	_, port, err := net.SplitHostPort(address)
	if err != nil {
		t.Fatal(err)
	}
	number, _ := strconv.Atoi(port)
	return number
}

func visible(viewer *member, id string) bool {
	_, ok := findItem(viewer.fwd.State().Others, id)
	return ok
}

// shareAndGet shares a real HTTP server from sharer, opens it on viewer and fetches it.
func shareAndGet(t *testing.T, sharer, viewer *member, body string) {
	t.Helper()
	web := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, body)
	}))
	defer web.Close()

	item, err := sharer.fwd.Share(portOf(t, web.Listener.Addr().String()), "Web")
	if err != nil {
		t.Fatal(err)
	}
	eventually(t, func() bool { return visible(viewer, item.ID) })

	opened, err := viewer.fwd.Open(item.ID)
	if err != nil || !opened.Open || opened.LocalPort == 0 {
		t.Fatalf("open failed: %+v %v", opened, err)
	}
	if opened.OwnerID != sharer.sess.SelfID() {
		t.Fatal("share lost its owner")
	}

	client := http.Client{Timeout: 20 * time.Second}
	response, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d/", opened.LocalPort))
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	got, _ := io.ReadAll(response.Body)
	if string(got) != body {
		t.Fatalf("got %q, want %q", got, body)
	}
}

func TestHTTPThroughForwardBothDirections(t *testing.T) {
	older, newer := startRoom(t)

	// The newer member dialed the link, so the older viewer needs the reverse request.
	t.Run("sharer newer, viewer older", func(t *testing.T) { shareAndGet(t, newer, older, "from the newer one") })
	t.Run("sharer older, viewer newer", func(t *testing.T) { shareAndGet(t, older, newer, "from the older one") })
}

// refusedStream opens a forward stream for an ID and says whether the sharer closed it.
func refusedStream(t *testing.T, viewer, sharer *member, id string) bool {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), 20*time.Second)
	defer cancel()
	conn, err := viewer.sess.OpenStream(ctx, sharer.sess.SelfID(), KindForward, []byte(id))
	if err != nil {
		return true
	}
	defer conn.Close()
	_ = conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	_, err = conn.Read(make([]byte, 1))
	return err != nil
}

func TestUnlistedAndStoppedSharesDialNothing(t *testing.T) {
	older, newer := startRoom(t)

	// A listener on the sharer that is never shared: any dial to it is a failure.
	bait, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer bait.Close()
	var dials atomic.Int32
	go func() {
		for {
			conn, err := bait.Accept()
			if err != nil {
				return
			}
			dials.Add(1)
			_ = conn.Close()
		}
	}()

	if !refusedStream(t, newer, older, "0123456789abcdef") {
		t.Fatal("an unlisted share ID was served")
	}
	if !refusedStream(t, older, newer, "0123456789abcdef") {
		t.Fatal("an unlisted share ID was served in the other direction")
	}

	// A share on the bait port, stopped, must refuse its old ID too.
	item, err := older.fwd.Share(portOf(t, bait.Addr().String()), "Bait")
	if err != nil {
		t.Fatal(err)
	}
	if err := older.fwd.Stop(item.ID); err != nil {
		t.Fatal(err)
	}
	if !refusedStream(t, newer, older, item.ID) {
		t.Fatal("a stopped share was served")
	}
	if dials.Load() != 0 {
		t.Fatalf("the sharer dialed %d times for refused streams", dials.Load())
	}
}

func TestStopClosesListenerAndConnections(t *testing.T) {
	older, newer := startRoom(t)

	hold, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer hold.Close()
	accepted := make(chan net.Conn, 4)
	go func() {
		for {
			conn, err := hold.Accept()
			if err != nil {
				return
			}
			accepted <- conn
		}
	}()

	item, err := older.fwd.Share(portOf(t, hold.Addr().String()), "Hold")
	if err != nil {
		t.Fatal(err)
	}
	eventually(t, func() bool { return visible(newer, item.ID) })
	opened, err := newer.fwd.Open(item.ID)
	if err != nil {
		t.Fatal(err)
	}

	address := net.JoinHostPort("127.0.0.1", strconv.Itoa(opened.LocalPort))
	client, err := net.Dial("tcp4", address)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	select {
	case <-accepted:
	case <-time.After(20 * time.Second):
		t.Fatal("the connection never reached the sharer's port")
	}

	if err := older.fwd.Stop(item.ID); err != nil {
		t.Fatal(err)
	}
	_ = client.SetReadDeadline(time.Now().Add(20 * time.Second))
	if _, err := client.Read(make([]byte, 1)); err == nil || os.IsTimeout(err) {
		t.Fatalf("the piped connection stayed open: %v", err)
	}
	eventually(t, func() bool {
		conn, err := net.Dial("tcp4", address)
		if err == nil {
			_ = conn.Close()
		}
		return err != nil && !visible(newer, item.ID)
	})
}

func TestLeaveRemovesSharesAndListener(t *testing.T) {
	older, newer := startRoom(t)

	web := httptest.NewServer(http.NotFoundHandler())
	defer web.Close()
	item, err := newer.fwd.Share(portOf(t, web.Listener.Addr().String()), "Web")
	if err != nil {
		t.Fatal(err)
	}
	eventually(t, func() bool { return visible(older, item.ID) })
	opened, err := older.fwd.Open(item.ID)
	if err != nil {
		t.Fatal(err)
	}

	_ = newer.sess.Leave()
	address := net.JoinHostPort("127.0.0.1", strconv.Itoa(opened.LocalPort))
	eventually(t, func() bool {
		conn, err := net.Dial("tcp4", address)
		if err == nil {
			_ = conn.Close()
		}
		return err != nil && !visible(older, item.ID)
	})
}

func TestConnectionCap(t *testing.T) {
	older, newer := startRoom(t)

	hold, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer hold.Close()
	var reached atomic.Int32
	go func() {
		for {
			conn, err := hold.Accept()
			if err != nil {
				return
			}
			reached.Add(1)
			defer conn.Close()
		}
	}()

	item, err := older.fwd.Share(portOf(t, hold.Addr().String()), "Hold")
	if err != nil {
		t.Fatal(err)
	}
	eventually(t, func() bool { return visible(newer, item.ID) })
	opened, err := newer.fwd.Open(item.ID)
	if err != nil {
		t.Fatal(err)
	}

	address := net.JoinHostPort("127.0.0.1", strconv.Itoa(opened.LocalPort))
	for range peer.MaxForwardConns {
		conn, err := net.Dial("tcp4", address)
		if err != nil {
			t.Fatal(err)
		}
		defer conn.Close()
	}
	eventually(t, func() bool { return reached.Load() == peer.MaxForwardConns })

	extra, err := net.Dial("tcp4", address)
	if err != nil {
		t.Fatal(err)
	}
	defer extra.Close()
	_ = extra.SetReadDeadline(time.Now().Add(10 * time.Second))
	if _, err := extra.Read(make([]byte, 1)); err == nil || os.IsTimeout(err) {
		t.Fatalf("connection %d was not refused: %v", peer.MaxForwardConns+1, err)
	}
}
