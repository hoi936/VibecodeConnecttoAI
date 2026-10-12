package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

func main() {
	executable, err := os.Executable()
	if err != nil {
		fmt.Fprintln(os.Stderr, "Không xác định được đường dẫn Code Bridge:", err)
		os.Exit(1)
	}
	runner := filepath.Clean(filepath.Join(filepath.Dir(executable), "..", "Resources", "app", "start-mac.command"))
	if _, err := os.Stat(runner); err != nil {
		fmt.Fprintln(os.Stderr, "Gói Code Bridge thiếu start-mac.command:", err)
		os.Exit(1)
	}
	command := exec.Command("/usr/bin/open", "-a", "Terminal", runner)
	if err := command.Run(); err != nil {
		fmt.Fprintln(os.Stderr, "Không mở được Terminal:", err)
		os.Exit(1)
	}
}
