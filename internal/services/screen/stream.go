package screen

import (
	"context"
	"encoding/binary"
	"io"
	"net"
	"time"
)

// ReadChunk reads one bounded flag-and-WebM frame, checking length before allocation.
func ReadChunk(reader io.Reader) ([]byte, error) {
	var header [4]byte

	if _, err := io.ReadFull(reader, header[:]); err != nil {
		return nil, err
	}

	length := binary.BigEndian.Uint32(header[:])

	if length < 2 || length > MaxChunk {
		return nil, badList()
	}

	chunk := make([]byte, length)
	_, err := io.ReadFull(reader, chunk)

	if err == nil && chunk[0] > 1 {
		return nil, badList()
	}

	return chunk, err
}

func writeChunk(conn net.Conn, chunk []byte) error {
	_ = conn.SetWriteDeadline(time.Now().Add(3 * time.Second))
	var header [4]byte
	binary.BigEndian.PutUint32(header[:], uint32(len(chunk)))
	buffers := net.Buffers{header[:], chunk}
	_, err := buffers.WriteTo(conn)
	return err
}

func (screens *Screens) serve(member string, header []byte, conn net.Conn) {
	defer conn.Close()
	screens.mu.Lock()

	if screens.closed || screens.local.Share == nil || screens.local.Share.ID != string(header) || screens.viewers[member] != nil {
		screens.mu.Unlock()
		return
	}

	view := &viewer{conn: conn, queue: make(chan []byte, 32)}

	for _, chunk := range screens.epoch {
		view.queue <- chunk
		view.bytes += len(chunk)
	}

	screens.viewers[member] = view
	screens.mu.Unlock()
	screens.notify()
	defer func() {
		screens.mu.Lock()

		if screens.viewers[member] == view {
			delete(screens.viewers, member)
		}

		screens.mu.Unlock()
		screens.notify()
	}()

	// The viewer sends no media. EOF, stop-watching or leave ends even an idle writer.
	done := make(chan struct{})

	go func() {
		var probe [1]byte
		_, _ = conn.Read(probe[:])

		_ = conn.Close()
		close(done)
	}()

	for {
		select {
		case chunk := <-view.queue:
			screens.mu.Lock()
			view.bytes -= len(chunk)
			screens.mu.Unlock()

			if writeChunk(conn, chunk) != nil {
				return
			}

		case <-done:
			return

		case <-screens.ctx.Done():
			return
		}
	}
}

// Watch opens the authenticated owner's stream. The caller must call Unwatch.
func (screens *Screens) Watch(ctx context.Context, id string) (net.Conn, error) {
	owner := ""

	for _, item := range screens.State().Others {
		if item.ID == id {
			owner = item.OwnerID
			break
		}
	}

	screens.mu.Lock()
	room := screens.room
	screens.mu.Unlock()

	if owner == "" || room == nil {
		return nil, net.ErrClosed
	}

	conn, err := room.OpenStream(ctx, owner, Kind, []byte(id))

	if err != nil {
		return nil, err
	}

	screens.mu.Lock()
	list, ok := screens.remote[owner]

	if screens.closed || !ok || list.Share == nil || list.Share.ID != id {
		screens.mu.Unlock()
		_ = conn.Close()
		return nil, net.ErrClosed
	}

	screens.watches[conn] = watch{owner: owner, id: id}
	screens.mu.Unlock()
	return conn, nil
}

// Unwatch closes and forgets a renderer's stream.
func (screens *Screens) Unwatch(conn net.Conn) {
	_ = conn.Close()
	screens.mu.Lock()
	delete(screens.watches, conn)
	screens.mu.Unlock()
}
