const API_URL =
  import.meta.env.VITE_API_URL || "https://akash-water.onrender.com";

const TOKEN_KEY = "akash_owner_token";

export const ownerToken = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (t) => sessionStorage.setItem(TOKEN_KEY, t),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
};

async function request(path, { method = "GET", body, auth = false } = {}) {
  const headers = {};

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (auth && ownerToken.get()) {
    headers.Authorization = `Bearer ${ownerToken.get()}`;
  }

  let res;

  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    throw new Error("Cannot reach the server. Check your connection and try again.");
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const error = new Error(data.error || "Something went wrong.");
    error.status = res.status;
    throw error;
  }

  return data;
}

export const api = {
  site: () => request("/site"),
  points: (phone) =>
    request(`/customers/points?phone=${encodeURIComponent(phone)}`),
  placeOrder: (body) =>
    request("/orders", { method: "POST", body }),
  verifyPayment: (publicId, body) =>
    request(`/orders/${publicId}/razorpay-verify`, {
      method: "POST",
      body,
    }),
  cancelUnpaid: (publicId) =>
    request(`/orders/${publicId}/cancel-unpaid`, {
      method: "POST",
    }),
};

export const admin = {
  login: (passcode) =>
    request("/admin/login", {
      method: "POST",
      body: { passcode },
    }),
  get: (path) => request(`/admin${path}`, { auth: true }),
  post: (path, body = {}) =>
    request(`/admin${path}`, {
      method: "POST",
      body,
      auth: true,
    }),
  put: (path, body) =>
    request(`/admin${path}`, {
      method: "PUT",
      body,
      auth: true,
    }),
  del: (path) =>
    request(`/admin${path}`, {
      method: "DELETE",
      auth: true,
    }),
};

export const rupees = (n) =>
  `₹${Number(n).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  })}`;

export const today = () =>
  new Date().toLocaleDateString("en-CA");