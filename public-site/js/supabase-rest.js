(function () {
  const url = "https://eppixfkfvxmjdyudzxja.supabase.co";
  const apiKey = "sb_publishable_X1t2-Y_fpZnA2x8nWcD8Vg_9OJ7twEs";

  function getStoredSession() {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
      try {
        const value = JSON.parse(localStorage.getItem(key));
        if (value?.access_token) return { ...value, storageKey: key };
      } catch {
        // Ignore unrelated or malformed local values.
      }
    }
    return null;
  }

  function decodeUser(accessToken) {
    try {
      const payload = accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const decoded = JSON.parse(decodeURIComponent(escape(atob(payload))));
      return { id: decoded.sub, email: decoded.email };
    } catch {
      return null;
    }
  }

  function tokenHasExpired(accessToken) {
    try {
      const payload = accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const decoded = JSON.parse(decodeURIComponent(escape(atob(payload))));
      return !decoded.exp || decoded.exp * 1000 <= Date.now();
    } catch {
      return true;
    }
  }

  function redirectExpiredSession(session) {
    if (session?.storageKey) localStorage.removeItem(session.storageKey);
    if (window.location.pathname.endsWith("/login.html")) return;
    const currentPage = `${window.location.pathname.split("/").pop() || "admin.html"}${window.location.search}`;
    const target = `login.html?session_expired=1&returnTo=${encodeURIComponent(currentPage)}`;
    window.location.replace(target);
  }

  async function request(path, options = {}) {
    const session = getStoredSession();
    if (!session) throw new Error("Your session has expired. Sign in again.");
    if (!options.skipAuthRedirect && tokenHasExpired(session.access_token)) {
      redirectExpiredSession(session);
      throw new Error("Your session has expired. Redirecting to sign in.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${url}${path}`, {
        method: options.method || "GET",
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...options.headers,
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
      const text = await response.text();
      const data = text ? JSON.parse(text) : null;
      if (response.status === 401 && !options.skipAuthRedirect) {
        redirectExpiredSession(session);
        throw new Error("Your session has expired. Redirecting to sign in.");
      }
      if (!response.ok) throw new Error(data?.message || data?.error_description || data?.hint || `Request failed (${response.status})`);
      return data;
    } catch (error) {
      if (error.name === "AbortError") throw new Error("Supabase did not respond within 15 seconds.");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function signOut() {
    const session = getStoredSession();
    if (session) {
      try {
        await request("/auth/v1/logout", { method: "POST", skipAuthRedirect: true });
      } catch {
        // Local logout must still complete if the network is unavailable.
      }
      localStorage.removeItem(session.storageKey);
    }
  }

  async function upload(bucket, path, file) {
    const session = getStoredSession();
    if (!session) throw new Error("Your session has expired. Sign in again.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    let response;
    try {
      response = await fetch(`${url}/storage/v1/object/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`, {
        method: "POST",
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": file.type || "application/octet-stream",
          "x-upsert": "false",
        },
        body: file,
        signal: controller.signal,
      });
    } catch (error) {
      if (error.name === "AbortError") throw new Error(`Upload timed out for ${file.name}. Please check your connection and try again.`);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    const data = await response.json().catch(() => null);
    if (response.status === 401) {
      redirectExpiredSession(session);
      throw new Error("Your session has expired. Redirecting to sign in.");
    }
    if (!response.ok) throw new Error(data?.message || data?.error || `Upload failed (${response.status})`);
    return {
      path,
      publicUrl: `${url}/storage/v1/object/public/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`,
    };
  }

  async function removeStorage(bucket, paths) {
    if (!paths.length) return;
    return request(`/storage/v1/object/${encodeURIComponent(bucket)}`, {
      method: "DELETE",
      body: { prefixes: paths },
    });
  }

  window.teemonApi = {
    getSession() {
      const session = getStoredSession();
      return session ? { ...session, user: decodeUser(session.access_token) } : null;
    },
    request,
    rpc(name, body) {
      return request(`/rest/v1/rpc/${name}`, { method: "POST", body });
    },
    select(table, query) {
      return request(`/rest/v1/${table}?${query}`);
    },
    upload,
    removeStorage,
    signOut,
  };
})();
