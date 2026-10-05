"use client";

import { useState, type FormEvent } from "react";
import { DEVICE_IDS } from "@/lib/energy-config";

type LoginFormProps = {
  initialError: string;
  onLoginSuccess: (deviceId: string) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export default function LoginForm({
  initialError,
  onLoginSuccess,
}: LoginFormProps) {
  const [error, setError] = useState(initialError);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: formData.get("username"),
          password: formData.get("password"),
          deviceId: formData.get("deviceId"),
        }),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        throw new Error(
          isRecord(payload) && typeof payload.message === "string"
            ? payload.message
            : "Login tidak dapat dilakukan.",
        );
      }

      if (
        !isRecord(payload) ||
        payload.authenticated !== true ||
        typeof payload.deviceId !== "string" ||
        !DEVICE_IDS.some((id) => id === payload.deviceId)
      ) {
        throw new Error("Respons login tidak sesuai.");
      }

      onLoginSuccess(payload.deviceId);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Login tidak dapat dilakukan.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="dashboard">
      <main className="login-page">
        <section className="login-panel" aria-labelledby="login-title">
          <div className="brand login-brand flex flex-col justify-center items-center gap-2">
            <span className="brand-mark text-lg" aria-hidden="true">
              💡
            </span>
            <span className="brand-copy">
              <strong>Energi Rumah</strong>
              <span>Pemantauan listrik</span>
            </span>
          </div>
          <p className="panel-kicker login-kicker">Akses perangkat</p>
          <h1 id="login-title">Masuk ke dashboard</h1>
          <p className="login-description">
            Masukkan akun dan pilih meter yang ingin dipantau.
          </p>

          <form className="login-form" onSubmit={handleSubmit}>
            <label htmlFor="username">Username</label>
            <input
              autoComplete="username"
              id="username"
              name="username"
              required
            />

            <label htmlFor="password">Password</label>
            <input
              autoComplete="current-password"
              id="password"
              name="password"
              type="password"
              required
            />

            <label htmlFor="deviceId">Pilih perangkat</label>
            <select
              id="deviceId"
              name="deviceId"
              defaultValue={DEVICE_IDS[0]}
              required
            >
              {DEVICE_IDS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>

            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}

            <button
              className="primary-button login-button"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Memeriksa..." : "Masuk"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
