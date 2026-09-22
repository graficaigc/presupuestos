/* Cliente API compartido por todas las páginas: maneja el token y las
   redirecciones cuando no hay sesión o la suscripción no está activa. */

const Api = {
  getToken() {
    return localStorage.getItem("token");
  },
  setSession(token, company) {
    localStorage.setItem("token", token);
    localStorage.setItem("company", JSON.stringify(company));
  },
  getCompany() {
    try {
      return JSON.parse(localStorage.getItem("company") || "null");
    } catch {
      return null;
    }
  },
  logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("company");
    window.location.href = "auth.html";
  },

  async request(path, options = {}) {
    const token = this.getToken();
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (token) headers.Authorization = "Bearer " + token;

    const res = await fetch("/api" + path, { ...options, headers });

    if (res.status === 401) {
      this.logout();
      throw new Error("Sesión expirada");
    }
    if (res.status === 402) {
      window.location.href = "facturacion.html?vencido=1";
      throw new Error("Suscripción inactiva");
    }

    const isJson = res.headers.get("content-type")?.includes("application/json");
    const body = isJson ? await res.json() : null;

    if (!res.ok) {
      throw new Error(body?.error || "Error de red");
    }
    return body;
  },

  get(path) { return this.request(path, { method: "GET" }); },
  post(path, data) { return this.request(path, { method: "POST", body: JSON.stringify(data) }); },
  put(path, data) { return this.request(path, { method: "PUT", body: JSON.stringify(data) }); },
  del(path) { return this.request(path, { method: "DELETE" }); },
};

function requireSession() {
  if (!Api.getToken()) {
    window.location.href = "auth.html";
  }
}
