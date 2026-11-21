package peer

// Port forward methods. Both are requests, so the caller knows they landed.
const (
	// MethodForwardAnnounce replaces the sender's whole list of shared ports.
	MethodForwardAnnounce = "forward.announce"
	// MethodForwardList asks for the receiver's own list of shared ports.
	MethodForwardList = "forward.list"
)

// Limits for forwards.
const (
	// MaxForwardsPerMember is how many ports one member can share at once.
	MaxForwardsPerMember = 16
	// MaxForwardLabel is the longest label, in characters.
	MaxForwardLabel = 64
	// MaxForwardConns is how many connections one opened share carries at once.
	MaxForwardConns = 64
)

// ForwardShare is one shared port as the other members hear about it.
type ForwardShare struct {
	// ID is chosen by the sharer: 16 lowercase hex characters.
	ID    string `json:"id"`
	Label string `json:"label"`
	// Port is the sharer's own port, 1 to 65535. Viewers only show it.
	Port int `json:"port"`
}

// ForwardList is the sender's complete list. Rev grows with every change, so
// a viewer ignores a list that arrives late.
type ForwardList struct {
	Rev    uint64         `json:"rev"`
	Shares []ForwardShare `json:"shares"`
}
