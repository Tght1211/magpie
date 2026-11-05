package quotaplan

import (
	"math"
	"time"
)

type edge struct {
	to, rev, slot      int
	cap, cost, initial float64
}
type graph [][]*edge

func (g graph) add(from, to int, capacity, cost float64) *edge {
	a := &edge{to: to, rev: len(g[to]), cap: capacity, cost: cost, initial: capacity}
	b := &edge{to: from, rev: len(g[from]), cost: -cost}
	g[from] = append(g[from], a)
	g[to] = append(g[to], b)
	return a
}

// Successive shortest augmenting paths, with residual edges permitting an
// earlier allocation to move when that admits more valuable expiring work.
func (g graph) run(source, sink int, stop time.Time) (float64, bool) {
	total := 0.0
	for {
		if time.Now().After(stop) {
			return total, false
		}
		dist := make([]float64, len(g))
		parent := make([]int, len(g))
		via := make([]int, len(g))
		queued := make([]bool, len(g))
		for i := range dist {
			dist[i] = math.Inf(1)
			parent[i] = -1
		}
		dist[source] = 0
		queue := []int{source}
		queued[source] = true
		for head := 0; head < len(queue); head++ {
			if head%256 == 0 && time.Now().After(stop) {
				return total, false
			}
			u := queue[head]
			queued[u] = false
			for j, e := range g[u] {
				if e.cap > eps && dist[e.to] > dist[u]+e.cost+eps {
					dist[e.to] = dist[u] + e.cost
					parent[e.to] = u
					via[e.to] = j
					if !queued[e.to] {
						queue = append(queue, e.to)
						queued[e.to] = true
					}
				}
			}
		}
		if parent[sink] < 0 {
			return total, true
		}
		amount := math.Inf(1)
		for v := sink; v != source; v = parent[v] {
			amount = math.Min(amount, g[parent[v]][via[v]].cap)
		}
		for v := sink; v != source; v = parent[v] {
			e := g[parent[v]][via[v]]
			e.cap -= amount
			g[v][e.rev].cap += amount
		}
		total += amount
	}
}
