package mesh

import (
	"bytes"
	"encoding/json"
	"io"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/Polyphron-AI/tailshare/internal/services/peer"
	"github.com/tailscale/tailcat"
	"tailscale.com/types/key"
)

func invalid() *peer.RemoteError {
	return &peer.RemoteError{Code: peer.CodeBadRequest, Message: "The share details are not valid."}
}

func failure() *peer.RemoteError {
	return &peer.RemoteError{Code: peer.CodeJoinFailed, Message: "Could not connect everyone in the share."}
}

func full() *peer.RemoteError {
	return &peer.RemoteError{Code: peer.CodeShareFull, Message: "This share already has eight people."}
}

func notAdmitter() *peer.RemoteError {
	return &peer.RemoteError{Code: peer.CodeNotAdmitter, Message: "Only the first member can admit someone."}
}

func decode(raw json.RawMessage, value any) error {
	if len(raw) == 0 || len(raw) > peer.MaxSharePayload || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return invalid()
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if decoder.Decode(value) != nil || decoder.Decode(new(any)) != io.EOF {
		return invalid()
	}
	return nil
}

func publicKey(text string) (key.NodePublic, error) {
	var public key.NodePublic
	if public.UnmarshalText([]byte(text)) != nil || public.IsZero() || public.String() != text {
		return public, invalid()
	}
	return public, nil
}

func validName(name string) bool {
	return strings.TrimSpace(name) != "" && utf8.ValidString(name) &&
		utf8.RuneCountInString(name) <= 64 && strings.IndexFunc(name, unicode.IsControl) < 0
}

func validateMember(member peer.ShareMember) error {
	public, err := publicKey(member.ID)
	if err != nil || member.JoinOrder == 0 || !validName(member.DisplayName) || len(member.Address) > 4096 {
		return invalid()
	}
	address, err := tailcat.ParseAddr(tailcat.Addr(member.Address))
	if err != nil || address.ServerPublic.NodePublic != public {
		return invalid()
	}
	return nil
}

func validateRoster(roster peer.ShareRoster) (map[string]peer.ShareMember, error) {
	encoded, err := json.Marshal(roster)
	if err != nil || len(encoded) > peer.MaxSharePayload ||
		len(roster.Members) == 0 || len(roster.Members) > peer.MaxShareMembers {
		return nil, invalid()
	}
	members := make(map[string]peer.ShareMember)
	orders := make(map[uint64]bool)
	for _, member := range roster.Members {
		if err := validateMember(member); err != nil {
			return nil, err
		}
		if _, exists := members[member.ID]; exists || orders[member.JoinOrder] {
			return nil, invalid()
		}
		members[member.ID] = member
		orders[member.JoinOrder] = true
	}
	return members, nil
}
