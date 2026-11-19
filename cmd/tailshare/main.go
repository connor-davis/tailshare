// Command tailshare is the Tailshare sidecar: the Go process the Electron app
// starts to do all networking and file work.
//
//	tailshare version   print the version
//	tailshare env       list every setting with its default
//	tailshare serve     run the local API for the Electron app
package main

import (
	"fmt"
	"os"

	"github.com/Polyphron-AI/tailshare/internal/platform/config"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) == 0 {
		return usage()
	}

	switch args[0] {
	case "version":
		fmt.Println(config.Version)

		return nil
	case "env":
		for _, e := range config.EnvVars {
			fmt.Printf("%s=%s\n    %s\n", e.Name, e.Default, e.Help)
		}

		return nil
	case "serve":
		return serveFromProcess()
	}

	return usage()
}

func usage() error {
	return fmt.Errorf("usage: tailshare version | env | serve")
}
