# Servidor local de pruebas. Corrige el tipo MIME de .js que a veces falla en Windows.
# Uso: python servidor.py   y abrir http://localhost:8080
import http.server, mimetypes
mimetypes.add_type("text/javascript", ".js")
http.server.test(HandlerClass=http.server.SimpleHTTPRequestHandler, port=8080)
