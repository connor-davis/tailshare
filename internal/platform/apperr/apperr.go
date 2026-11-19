// Package apperr is the one error type the local API sends to the screen: an
// HTTP status, a stable code the UI can switch on, and a plain sentence that
// is safe to show. It knows nothing about services; the API maps their errors
// onto it.
package apperr

import "net/http"

// Error is an error a caller may see. Message is always a plain sentence with
// no Go error text and no local path.
type Error struct {
	// Status is the HTTP status. It is never sent to the page.
	Status  int    `json:"-"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Error returns the plain sentence.
func (e *Error) Error() string {
	return e.Message
}

// New builds an Error with any status and code.
func New(status int, code, message string) *Error {
	return &Error{Status: status, Code: code, Message: message}
}

// BadRequest is for input the caller can fix.
func BadRequest(message string) *Error {
	return New(http.StatusBadRequest, "bad_request", message)
}

// Unauthorized is the answer to a missing or wrong token.
func Unauthorized() *Error {
	return New(http.StatusUnauthorized, "unauthorized", "This request is not authorized.")
}

// Forbidden is the answer to a request from a place that is not allowed.
func Forbidden() *Error {
	return New(http.StatusForbidden, "forbidden", "This request is not allowed.")
}

// NotFound means nothing is at that address.
func NotFound(message string) *Error {
	return New(http.StatusNotFound, "not_found", message)
}

// Conflict means the request does not fit the current state.
func Conflict(code, message string) *Error {
	return New(http.StatusConflict, code, message)
}

// Unavailable means the other computer could not be reached.
func Unavailable(message string) *Error {
	return New(http.StatusBadGateway, "unavailable", message)
}

// Internal is the generic answer for a bug: it says nothing about the cause.
func Internal() *Error {
	return New(http.StatusInternalServerError, "internal", "Something went wrong. Try again.")
}
