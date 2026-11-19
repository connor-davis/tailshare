package peer

import (
	"context"
	"encoding/json"

	"github.com/Polyphron-AI/tailshare/internal/services/share"
)

// Entry is one file or folder in the other computer's shared folder.
type Entry = share.Entry

// List asks for one page of a folder on the other computer. An empty dir is
// its shared folder. Limit 0 means the most it allows (1000 entries).
func (peer *Peer) List(ctx context.Context, dir string, offset, limit int) (ListResult, error) {
	var result ListResult
	err := peer.Call(ctx, MethodList, listParams{Dir: dir, Offset: offset, Limit: limit}, &result)

	return result, err
}

// Stat asks about one file or folder on the other computer.
func (peer *Peer) Stat(ctx context.Context, path string) (Entry, error) {
	var result Entry
	err := peer.Call(ctx, MethodStat, statParams{Path: path}, &result)

	return result, err
}

func (peer *Peer) handleList(raw json.RawMessage) (any, error) {
	if peer.options.Share == nil {
		return nil, errNotSharing()
	}

	var params listParams
	if err := json.Unmarshal(raw, &params); err != nil || params.Offset < 0 || params.Limit < 0 {
		return nil, badRequest()
	}

	entries, total, err := peer.options.Share.List(params.Dir, params.Offset, params.Limit)
	if err != nil {
		return nil, err
	}

	return ListResult{Entries: entries, Total: total}, nil
}

func (peer *Peer) handleStat(raw json.RawMessage) (any, error) {
	if peer.options.Share == nil {
		return nil, errNotSharing()
	}

	var params statParams
	if err := json.Unmarshal(raw, &params); err != nil {
		return nil, badRequest()
	}

	return peer.options.Share.Stat(params.Path)
}

func errNotSharing() *RemoteError {
	return &RemoteError{Code: CodeNotSharing, Message: "That computer is not sharing a folder."}
}
