package gui

import (
	"context"
	"net"
	"strconv"
	"testing"
	"time"
)

// Keep real child processes, HTTP streams, program identity checks and signals.
// Only discovery is scoped to the fixture; proc tests cover the native lookup.
func fakeGatewayListener(t *testing.T, addr string, pid int, ended <-chan struct{}, delay ...time.Duration) {
	t.Helper()
	_, text, err := net.SplitHostPort(addr)
	if err != nil {
		t.Fatal(err)
	}
	port, err := strconv.Atoi(text)
	if err != nil {
		t.Fatal(err)
	}
	gatewayMu.Lock()
	before := gatewayListeners
	first := true
	gatewayListeners = func(ctx context.Context, target int) ([]int, error) {
		if target != port {
			return before(ctx, target)
		}
		if first {
			first = false
			if len(delay) > 0 && delay[0] > 0 {
				timer := time.NewTimer(delay[0])
				defer timer.Stop()
				select {
				case <-timer.C:
				case <-ctx.Done():
					return nil, ctx.Err()
				}
			}
		}
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		select {
		case <-ended:
			return nil, nil
		default:
			return []int{pid}, nil
		}
	}
	gatewayMu.Unlock()
	t.Cleanup(func() { gatewayMu.Lock(); gatewayListeners = before; gatewayMu.Unlock() })
}
