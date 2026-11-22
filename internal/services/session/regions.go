package session

import (
	"context"
	"net"
	"sync"
	"time"

	"github.com/connor-davis/tailshare/internal/services/codes"
	"github.com/tailscale/tailcat"
	"tailscale.com/tailcfg"
	"tailscale.com/types/key"
)

func regionOrder(preferred tailcfg.DERPRegionID) []tailcfg.DERPRegionID {
	regions := []tailcfg.DERPRegionID{preferred}
	for _, region := range []tailcfg.DERPRegionID{301, 302, 303, 304} {
		if region != preferred {
			regions = append(regions, region)
		}
	}
	// Custom maps retain their original single region for offline callers.
	if preferred < 301 || preferred > 304 {
		return regions[:1]
	}
	return regions
}

type bootstrap struct {
	client *tailcat.Client
	conn   net.Conn
}

func raceBootstrap(
	ctx context.Context,
	code codes.Code,
	identity key.NodePrivate,
	options settings,
) (*tailcat.Client, net.Conn, error) {
	bounded, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	regions := regionOrder(options.regionID)
	results := make(chan bootstrap, len(regions))
	var attempts sync.WaitGroup
	// A short head start makes the local preference first, without multiplying the deadline.
	for index, region := range regions {
		attempts.Go(func() {
			if index > 0 {
				timer := time.NewTimer(150 * time.Millisecond)
				defer timer.Stop()
				select {
				case <-timer.C:
				case <-bounded.Done():
					return
				}
			}
			var resolveOptions []any
			if options.derpMap != nil {
				resolveOptions = append(resolveOptions, options.derpMap)
			} else if options.mapURL != "" {
				resolveOptions = append(resolveOptions, tailcat.DERPMapURL(options.mapURL))
			}
			address, err := codes.Addr(code, region).Resolve(bounded, resolveOptions...)
			if err != nil {
				return
			}
			client := tailcat.NewClient(address)
			client.Key, client.Logf = identity, quietLog
			conn, err := dialBootstrap(bounded, client)
			if err != nil {
				_ = client.Close()
				return
			}
			results <- bootstrap{client: client, conn: conn}
		})
	}
	done := make(chan struct{})
	go func() { attempts.Wait(); close(done) }()
	var winner bootstrap
	select {
	case winner = <-results:
	case <-done:
		select {
		case winner = <-results:
		default:
		}
	case <-bounded.Done():
	}
	cancel()
	// No losing attempt may continue to hello/admission, even if two dials completed together.
	<-done
	close(results)
	for loser := range results {
		_ = loser.conn.Close()
		_ = loser.client.Close()
	}
	if winner.client == nil {
		return nil, nil, context.DeadlineExceeded
	}
	return winner.client, winner.conn, nil
}
