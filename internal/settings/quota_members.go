package settings

import (
	"errors"
	"maps"
	"strings"
)

// BindQuotaMember changes only the ownership annotation under the settings lock.
// Account references are stable provider/login IDs validated by the caller.
func BindQuotaMember(key, account string, present ...map[string]bool) error {
	defer lockFile()()
	s, err := loadChecked()
	if err != nil {
		return err
	}
	m := maps.Clone(s.QuotaMembers)
	if m == nil {
		m = map[string]string{}
	}
	// A binding action may release annotations for Keys that were deleted.
	if len(present) > 0 {
		for k := range m {
			if !present[0][k] {
				delete(m, k)
			}
		}
	}
	for k, a := range m {
		if k != key && account != "" && strings.EqualFold(a, account) {
			return errors.New("account already belongs to another member")
		}
	}
	if account == "" {
		delete(m, key)
	} else {
		m[key] = account
	}
	s.QuotaMembers = m
	return saveOwn(s, false, false, true)
}
