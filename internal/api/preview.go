package api

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/connor-davis/tailshare/internal/platform/apperr"
	"github.com/connor-davis/tailshare/internal/services/share"
	"github.com/gofiber/fiber/v3"
)

const (
	// maxPreviewImage is the biggest picture a card may show, in bytes.
	maxPreviewImage = 256 << 10
	// maxPreviewText is how much of a text file a card may show, in bytes.
	maxPreviewText = 2 << 10
)

// previewTypes are the only picture types a card shows. SVG is left out on purpose,
// because it can carry script.
var previewTypes = map[string]bool{
	"image/png": true, "image/jpeg": true, "image/gif": true, "image/webp": true,
}

// markupSuffixes are file names that are never shown, whatever their bytes look like.
var markupSuffixes = []string{".svg", ".svgz", ".html", ".htm", ".xhtml", ".xml"}

// previewReply is what a card gets. Kind is "image", "text" or "none".
type previewReply struct {
	Kind string `json:"kind"`
	// Mime is set for an image. It is one of previewTypes.
	Mime string `json:"mime,omitempty"`
	// Data is the image bytes in base64, up to maxPreviewImage bytes before encoding.
	Data string `json:"data,omitempty"`
	// Text is the start of a UTF-8 text file, up to maxPreviewText bytes.
	Text string `json:"text,omitempty"`
	// Cut is true when the file has more text than Text holds.
	Cut bool `json:"cut,omitempty"`
}

// noPreview is the answer for anything that is not safe or not small enough to show.
var noPreview = previewReply{Kind: "none"}

// previewOf reads at most a capped part of an already opened file and says what a card
// may show. It never trusts the file name alone: the bytes decide.
func previewOf(file *os.File, name string) previewReply {
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() {
		return noPreview
	}

	lower := strings.ToLower(name)
	for _, suffix := range markupSuffixes {
		if strings.HasSuffix(lower, suffix) {
			return noPreview
		}
	}

	head := make([]byte, 512)
	count, err := io.ReadFull(file, head)
	if err != nil && err != io.ErrUnexpectedEOF && err != io.EOF {
		return noPreview
	}
	head = head[:count]

	kind := http.DetectContentType(head)
	mime, _, _ := strings.Cut(kind, ";")
	if previewTypes[mime] {
		return imagePreview(file, info.Size(), head, mime)
	}
	if mime != "text/plain" || !strings.Contains(kind, "utf-8") || looksLikeMarkup(head) {
		return noPreview
	}

	return textPreview(file, info.Size(), head)
}

// imagePreview returns the whole picture, or nothing when it is over the cap.
func imagePreview(file *os.File, size int64, head []byte, mime string) previewReply {
	if size > maxPreviewImage {
		return noPreview
	}

	rest, err := io.ReadAll(io.LimitReader(file, maxPreviewImage+1))
	if err != nil || int64(len(head)+len(rest)) > maxPreviewImage {
		return noPreview
	}

	return previewReply{
		Kind: "image", Mime: mime, Data: base64.StdEncoding.EncodeToString(append(head, rest...)),
	}
}

// textPreview returns the first maxPreviewText bytes, cut on a whole character.
func textPreview(file *os.File, size int64, head []byte) previewReply {
	data := head
	if int64(len(data)) < size && len(data) < maxPreviewText {
		more, err := io.ReadAll(io.LimitReader(file, int64(maxPreviewText-len(data))))
		if err != nil {
			return noPreview
		}
		data = append(data, more...)
	}

	// A cap that lands inside a character must not make good text look broken.
	cut := size > int64(len(data))
	for i := 0; cut && i < utf8.UTFMax-1 && len(data) > 0 && !utf8.Valid(data); i++ {
		data = data[:len(data)-1]
	}
	if !utf8.Valid(data) {
		return noPreview
	}

	text := string(data)
	if strings.ContainsFunc(text, func(r rune) bool {
		return unicode.IsControl(r) && r != '\n' && r != '\r' && r != '\t'
	}) {
		return noPreview
	}

	return previewReply{Kind: "text", Text: text, Cut: cut}
}

// looksLikeMarkup spots HTML, XML and SVG by their first bytes, because Go calls a bare
// `<svg>` file plain text.
func looksLikeMarkup(head []byte) bool {
	start := strings.ToLower(strings.TrimLeftFunc(string(head), unicode.IsSpace))

	return strings.HasPrefix(start, "<") || strings.Contains(start, "<svg") ||
		strings.Contains(start, "<html") || strings.Contains(start, "<!doctype")
}

// previewFrom opens one file in a folder with the same path rules as a download.
func previewFrom(root *share.Root, wire string) (previewReply, error) {
	file, err := root.OpenRead(wire)
	if err != nil {
		return noPreview, err
	}
	defer func() { _ = file.Close() }()

	return previewOf(file, path.Base(wire)), nil
}

// roomPreview shows a small preview of a file this computer shared in the room.
func (server *Server) roomPreview(c fiber.Ctx) error {
	wire := c.Query("path")
	if wire == "" {
		return share.ErrBadPath
	}

	// Leave waits for readers, so the folder cannot close under this read.
	server.roomIO.RLock()
	defer server.roomIO.RUnlock()
	server.mu.Lock()
	root := server.root
	server.mu.Unlock()
	if root == nil {
		return errNotConnected()
	}

	reply, err := previewFrom(root, wire)
	if err != nil {
		return err
	}

	return c.JSON(reply)
}

// downloadPreview shows a small preview of a file that was saved into a folder the
// person chose. Only the main process may call it, because the renderer never sends paths.
func (server *Server) downloadPreview(c fiber.Ctx) error {
	var in struct {
		Folder string `json:"folder"`
		Name   string `json:"name"`
	}
	if json.Unmarshal(c.Body(), &in) != nil || in.Name == "" || strings.ContainsAny(in.Name, "/\\") {
		return apperr.BadRequest("Say which saved file to preview.")
	}
	if err := pickedFolder(in.Folder); err != nil {
		return err
	}

	root, err := share.Open(in.Folder)
	if err != nil {
		return apperr.BadRequest("Could not open that folder.")
	}
	defer func() { _ = root.Close() }()

	reply, err := previewFrom(root, in.Name)
	if err != nil {
		return err
	}

	return c.JSON(reply)
}
