package main

import (
	"io/fs"
	"net/http"
	"os"
	"path"
	"strings"

	"github.com/Js-Meneses/fullstack-calculator/backend/internal/httpapi"
)

// newHandler returns the API handler alone when staticDir is empty. Otherwise
// it sends /api and /api/... to the API and serves the files in staticDir on
// every other path, for GET and HEAD only.
func newHandler(staticDir string) http.Handler {
	api := httpapi.NewHandler()
	if staticDir == "" {
		return api
	}

	files := http.FileServerFS(indexOnlyFS{os.DirFS(staticDir)})
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api" || strings.HasPrefix(r.URL.Path, "/api/") {
			api.ServeHTTP(w, r)
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, http.StatusText(http.StatusMethodNotAllowed), http.StatusMethodNotAllowed)
			return
		}
		files.ServeHTTP(w, r)
	})
}

// indexOnlyFS reports a directory without index.html as not existing, so
// http.FileServer answers 404 instead of a directory listing.
type indexOnlyFS struct {
	fsys fs.FS
}

func (f indexOnlyFS) Open(name string) (fs.File, error) {
	file, err := f.fsys.Open(name)
	if err != nil {
		return nil, err
	}
	info, err := file.Stat()
	if err != nil {
		file.Close()
		return nil, err
	}
	if info.IsDir() {
		index, err := f.fsys.Open(path.Join(name, "index.html"))
		if err != nil {
			file.Close()
			return nil, fs.ErrNotExist
		}
		index.Close()
	}
	return file, nil
}
