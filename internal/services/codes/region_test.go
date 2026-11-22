package codes

import (
	"github.com/tailscale/tailcat"
	"reflect"
	"tailscale.com/tailcfg"
	"testing"
)

func TestRegionChangesOnlyRegionID(t *testing.T) {
	baseline, err := tailcat.ParseAddr(Addr("7K3Q9PXM", 303))
	if err != nil {
		t.Fatal(err)
	}
	for _, id := range []tailcfg.DERPRegionID{301, 302, 304} {
		got, err := tailcat.ParseAddr(Addr("7K3Q9PXM", id))
		if err != nil {
			t.Fatal(err)
		}
		if got.RegionID != id {
			t.Fatalf("wrong region %v", got.RegionID)
		}
		got.RegionID = baseline.RegionID
		if !reflect.DeepEqual(got, baseline) {
			t.Fatalf("region changed keys or address material: %v", id)
		}
	}
}
