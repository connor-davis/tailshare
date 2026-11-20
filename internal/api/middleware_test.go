package api

import (
	"net/http"
	"strings"
	"testing"

	"github.com/connor-davis/tailshare/internal/platform/config"
)

const unauthorizedBody = `{"code":"unauthorized","message":"This request is not authorized."}`

func withoutToken(r *http.Request) { r.Header.Del("Authorization") }

var allRoutes = []struct{ method, path string }{
	{"GET", "/api/health"},
	{"GET", "/api/session"},
	{"POST", "/api/session/host"},
	{"POST", "/api/session/join"},
	{"DELETE", "/api/session"},
	{"PUT", "/api/folder"},
	{"GET", "/api/files/local"},
	{"GET", "/api/files/peer"},
	{"GET", "/api/chat"},
	{"POST", "/api/chat"},
	{"GET", "/api/transfers"},
	{"POST", "/api/transfers"},
	{"POST", "/api/transfers/1/pause"},
	{"POST", "/api/transfers/1/resume"},
	{"DELETE", "/api/transfers/1"},
	{"GET", "/api/live"},
	{"GET", "/api/nothing-here"},
}

func TestEveryRouteNeedsTheToken(t *testing.T) {
	f := newFixture(t, config.Config{}, nil)

	bad := map[string]func(*http.Request){
		"missing":      withoutToken,
		"wrong":        func(r *http.Request) { r.Header.Set("Authorization", "Bearer "+strings.Repeat("cd", 32)) },
		"too short":    func(r *http.Request) { r.Header.Set("Authorization", "Bearer abab") },
		"too long":     func(r *http.Request) { r.Header.Set("Authorization", "Bearer "+testToken+"00") },
		"no scheme":    func(r *http.Request) { r.Header.Set("Authorization", testToken) },
		"lower scheme": func(r *http.Request) { r.Header.Set("Authorization", "bearer "+testToken) },
		"twice":        func(r *http.Request) { r.Header.Add("Authorization", "Bearer "+testToken) },
	}

	for _, route := range allRoutes {
		for name, change := range bad {
			got := f.send(route.method, route.path, nil, change)
			if got.Status != 401 || string(got.Raw) != unauthorizedBody {
				t.Errorf("%s %s (%s): %d %s", route.method, route.path, name, got.Status, got.Raw)
			}
		}

		// The live socket takes its token as a subprotocol, so a bearer header
		// alone is refused there (live_test.go covers the right way in).
		if route.path == livePath {
			f.send(route.method, route.path, nil).expect(t, 401, "unauthorized")
			continue
		}

		// The right token is never refused with 401, whatever else is wrong.
		if got := f.send(route.method, route.path, nil); got.Status == 401 {
			t.Errorf("%s %s with the token: %d %s", route.method, route.path, got.Status, got.Raw)
		}
	}
}

func TestTokenMatches(t *testing.T) {
	for offered, want := range map[string]bool{
		testToken: true, "": false, "a": false, testToken[:63]: false, testToken + "a": false,
		strings.Repeat("cd", 32): false,
	} {
		if got := tokenMatches(offered, testToken); got != want {
			t.Errorf("tokenMatches(%q) = %v, want %v", offered, got, want)
		}
	}
}

func TestNewRefusesBadTokens(t *testing.T) {
	for _, token := range []string{"", "abc", strings.Repeat("zz", 32), strings.Repeat("ab", 31), strings.Repeat("ab", 33)} {
		if _, err := New(config.Config{Token: token}); err == nil {
			t.Errorf("token %q was accepted", token)
		}
	}
}

func TestListenRefusesNonLoopback(t *testing.T) {
	for _, addr := range []string{"0.0.0.0:0", ":0", "[::]:0", "[::1]:0", "localhost:0", "192.168.1.5:0", "example.com:80", "127.0.0.1"} {
		server, err := New(config.Config{Token: testToken, Addr: addr})
		if err != nil {
			t.Fatal(err)
		}

		if listener, err := server.Listen(); err == nil {
			_ = listener.Close()
			t.Errorf("address %q was accepted", addr)
		}
	}
}

func TestHealth(t *testing.T) {
	f := newFixture(t, config.Config{}, nil)

	got := f.send("GET", "/api/health", nil)
	got.expect(t, 200, "")

	if got.Body["status"] != "ok" || got.Body["version"] != config.Version || len(got.Body) != 2 {
		t.Fatalf("health = %s", got.Raw)
	}
}

func TestHostHeader(t *testing.T) {
	f := newFixture(t, config.Config{}, nil)
	port := f.host[strings.LastIndex(f.host, ":")+1:]

	host := func(value string) func(*http.Request) {
		return func(r *http.Request) { r.Host = value }
	}

	for _, ok := range []string{f.host, "localhost:" + port} {
		f.send("GET", "/api/health", nil, host(ok)).expect(t, 200, "")
	}

	for _, bad := range []string{"evil.example", "evil.example:" + port, "127.0.0.1:1", "localhost", "127.0.0.1", "[::1]:" + port} {
		f.send("GET", "/api/health", nil, host(bad)).expect(t, 403, "forbidden")
	}

	// A forwarded header never makes a foreign Host acceptable, or the reverse.
	f.send("GET", "/api/health", nil, host("evil.example"), func(r *http.Request) {
		r.Header.Set("X-Forwarded-Host", f.host)
	}).expect(t, 403, "forbidden")
	f.send("GET", "/api/health", nil, func(r *http.Request) {
		r.Header.Set("X-Forwarded-Host", "evil.example")
	}).expect(t, 200, "")
}

func TestOrigin(t *testing.T) {
	f := newFixture(t, config.Config{}, nil)

	origin := func(value string) func(*http.Request) {
		return func(r *http.Request) { r.Header.Set("Origin", value) }
	}

	for _, ok := range []string{"null", "http://localhost:5173"} {
		got := f.send("GET", "/api/health", nil, origin(ok))
		got.expect(t, 200, "")

		if got.Header.Get("Access-Control-Allow-Origin") != ok || got.Header.Get("Vary") != "Origin" {
			t.Errorf("origin %q: headers %v", ok, got.Header)
		}
		if got.Header.Get("Access-Control-Allow-Credentials") != "" {
			t.Errorf("origin %q: credentials allowed", ok)
		}
	}

	for _, bad := range []string{"https://evil.example", "http://localhost:5174", "http://localhost:5173/", "http://127.0.0.1:5173", "*", "NULL"} {
		got := f.send("GET", "/api/health", nil, origin(bad))
		got.expect(t, 403, "forbidden")

		if got.Header.Get("Access-Control-Allow-Origin") != "" {
			t.Errorf("origin %q was echoed", bad)
		}
	}

	// No Origin means a native client: allowed, and no CORS headers at all.
	got := f.send("GET", "/api/health", nil)
	if got.Header.Get("Access-Control-Allow-Origin") != "" {
		t.Errorf("CORS header without an origin: %v", got.Header)
	}

	// The origin check comes before the token check.
	f.send("GET", "/api/health", nil, origin("https://evil.example"), withoutToken).expect(t, 403, "forbidden")
}

func TestPreflight(t *testing.T) {
	f := newFixture(t, config.Config{}, nil)

	preflight := func(value string) func(*http.Request) {
		return func(r *http.Request) {
			withoutToken(r)
			r.Header.Set("Origin", value)
			r.Header.Set("Access-Control-Request-Method", "PUT")
			r.Header.Set("Access-Control-Request-Headers", "authorization, content-type")
		}
	}

	for _, ok := range []string{"null", "http://localhost:5173"} {
		got := f.send("OPTIONS", "/api/folder", nil, preflight(ok))
		got.expect(t, 204, "")

		if got.Header.Get("Access-Control-Allow-Origin") != ok ||
			got.Header.Get("Access-Control-Allow-Methods") != "GET, POST, PUT, DELETE" ||
			got.Header.Get("Access-Control-Allow-Headers") != "Authorization, Content-Type" ||
			got.Header.Get("Access-Control-Allow-Credentials") != "" {
			t.Errorf("origin %q: headers %v", ok, got.Header)
		}
	}

	f.send("OPTIONS", "/api/folder", nil, preflight("https://evil.example")).expect(t, 403, "forbidden")

	// Without an Origin it is no preflight, so the token is required.
	f.send("OPTIONS", "/api/folder", nil, withoutToken).expect(t, 401, "unauthorized")
}
