package apperr

import (
	"encoding/json"
	"errors"
	"net/http"
	"testing"
)

func TestErrorShape(t *testing.T) {
	cases := []struct {
		err    *Error
		status int
		code   string
	}{
		{BadRequest("Fix it."), http.StatusBadRequest, "bad_request"},
		{Unauthorized(), http.StatusUnauthorized, "unauthorized"},
		{Forbidden(), http.StatusForbidden, "forbidden"},
		{NotFound("Gone."), http.StatusNotFound, "not_found"},
		{Conflict("busy", "Busy."), http.StatusConflict, "busy"},
		{Unavailable("Down."), http.StatusBadGateway, "unavailable"},
		{Internal(), http.StatusInternalServerError, "internal"},
	}

	for _, tc := range cases {
		if tc.err.Status != tc.status || tc.err.Code != tc.code || tc.err.Message == "" {
			t.Errorf("%+v, want %d %s", tc.err, tc.status, tc.code)
		}

		var target *Error
		if !errors.As(error(tc.err), &target) || target.Error() != tc.err.Message {
			t.Errorf("%s: not recognised as *Error", tc.code)
		}
	}
}

func TestJSONHasOnlyCodeAndMessage(t *testing.T) {
	raw, err := json.Marshal(Unauthorized())
	if err != nil {
		t.Fatal(err)
	}

	want := `{"code":"unauthorized","message":"This request is not authorized."}`
	if string(raw) != want {
		t.Fatalf("got %s, want %s", raw, want)
	}
}
