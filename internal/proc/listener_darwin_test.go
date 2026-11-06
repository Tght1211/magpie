package proc

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func fakeListenerCommand(t *testing.T, body string) string {
	t.Helper()
	p := filepath.Join(t.TempDir(), "lsof")
	if err := os.WriteFile(p, []byte("#!/bin/sh\n"+body+"\n"), 0700); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestDarwinListenerAvoidsFilesystemBlocks(t *testing.T) {
	// The fixture stalls on filesystem inspection, as a blocked mount does.
	// Socket-only inspection still identifies the listening process.
	cmd := fakeListenerCommand(t, `for arg do
 if [ "$arg" = "-b" ]; then echo 4242; exit 0; fi
done
exec /bin/sleep 60`)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	got, err := lsofListeningOn(ctx, cmd, 3430)
	if err != nil || len(got) != 1 || got[0] != 4242 {
		t.Fatalf("socket discovery blocked on filesystem inspection: pids=%v err=%v", got, err)
	}
}

func TestDarwinListenerFailuresAreNotEmptyPorts(t *testing.T) {
	for _, c := range []struct {
		name, body string
		empty      bool
	}{
		{"no listener", "exit 1", true},
		{"query failure", "exit 2", false},
		{"terminated query", "kill -TERM $$", false},
		{"partial failure", "echo 4242; exit 1", false},
	} {
		t.Run(c.name, func(t *testing.T) {
			got, err := lsofListeningOn(context.Background(), fakeListenerCommand(t, c.body), 3430)
			if c.empty {
				if err != nil || len(got) != 0 {
					t.Fatalf("empty port: %v %v", got, err)
				}
			} else if err == nil {
				t.Fatalf("failed query became a successful port reading: %v", got)
			}
		})
	}
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	got, err := lsofListeningOn(ctx, fakeListenerCommand(t, "exec /bin/sleep 60"), 3430)
	if !errors.Is(err, context.DeadlineExceeded) || len(got) != 0 {
		t.Fatalf("timed-out discovery must stay unknown: %v %v", got, err)
	}
}
