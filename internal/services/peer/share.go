package peer

// MaxShareMembers counts everyone in the share, including its creator.
const MaxShareMembers = 8

// MaxSharePayload limits share requests and events to 16 KiB before decoding.
const MaxSharePayload = 16 << 10

// ShareMember identifies a member by its mesh server's public node key.
type ShareMember struct {
	ID          string `json:"id"`
	DisplayName string `json:"displayName"`
	Address     string `json:"address"`
	// JoinOrder is positive and unique; the lowest surviving order admits.
	JoinOrder uint64 `json:"joinOrder"`
}

// ShareRoster includes the approved joiner and every existing member.
type ShareRoster struct {
	Members []ShareMember `json:"members"`
}

// ShareLink gives one member the joiner's fresh dialing key.
type ShareLink struct {
	ID      string `json:"id"`
	LinkKey string `json:"linkKey"`
}

// ShareLinks contains exactly one distinct key per existing roster member.
type ShareLinks struct {
	Links []ShareLink `json:"links"`
}

// ShareAdmit is sent by the admitter before the joiner dials this member.
type ShareAdmit struct {
	JoinerID      string `json:"joinerId"`
	JoinerName    string `json:"joinerName"`
	JoinerAddress string `json:"joinerAddress"`
	JoinOrder     uint64 `json:"joinOrder"`
	LinkKey       string `json:"linkKey"`
}

// ShareLeave has no claimed identity: the authenticated link names its sender.
type ShareLeave struct{}
