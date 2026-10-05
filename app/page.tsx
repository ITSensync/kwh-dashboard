"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { DEVICE_IDS } from "@/lib/energy-config";
import LoginForm from "@/app/components/LoginForm";

const REFRESH_INTERVAL = 3 * 60 * 1000;

type KwhReading = {
  id: number;
  deviceId: string;
  timestamp: number;
  datetime: string;
  tokenKwh: string | number;
  tokenPulses: number;
  usedKwhSinceTopup: string | number;
  power: number;
  rssi: number;
  uptime: number;
  sensorFault: boolean;
};

type TopupRecord = {
  id: number;
  deviceId: string;
  totalTopupKwh: string | number;
  createdAt: string;
  updatedAt: string;
};

type DateFilters = {
  startDate: string;
  endDate: string;
};

type Theme = "light" | "dark";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNumericValue(value: unknown): value is string | number {
  return (
    isNumber(value) ||
    (typeof value === "string" &&
      value.trim() !== "" &&
      Number.isFinite(Number(value)))
  );
}

function isKwhReading(value: unknown): value is KwhReading {
  return (
    isRecord(value) &&
    isNumber(value.id) &&
    typeof value.deviceId === "string" &&
    isNumber(value.timestamp) &&
    typeof value.datetime === "string" &&
    isNumericValue(value.tokenKwh) &&
    isNumber(value.tokenPulses) &&
    isNumericValue(value.usedKwhSinceTopup) &&
    isNumber(value.power) &&
    isNumber(value.rssi) &&
    isNumber(value.uptime) &&
    typeof value.sensorFault === "boolean"
  );
}

function isTopupRecord(value: unknown): value is TopupRecord {
  return (
    isRecord(value) &&
    isNumber(value.id) &&
    typeof value.deviceId === "string" &&
    (typeof value.totalTopupKwh === "string" ||
      isNumber(value.totalTopupKwh)) &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

function isTopupList(value: unknown): value is TopupRecord[] {
  return Array.isArray(value) && value.every(isTopupRecord);
}

function isKwhList(value: unknown): value is KwhReading[] {
  return Array.isArray(value) && value.every(isKwhReading);
}

async function readApiData<T>(
  response: Response,
  isData: (value: unknown) => value is T,
): Promise<T> {
  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new Error("Layanan energi mengirim respons yang tidak valid.");
  }

  if (!isRecord(payload)) {
    throw new Error("Format respons dari layanan energi tidak dikenali.");
  }

  if (!response.ok || payload.status !== 200) {
    throw new Error(
      typeof payload.message === "string"
        ? payload.message
        : `Permintaan gagal (${response.status}).`,
    );
  }

  if (!isData(payload.data)) {
    throw new Error(
      "Data yang diterima tidak sesuai dengan format yang diharapkan.",
    );
  }

  return payload.data;
}

function formatNumber(value: number | string, maximumFractionDigits = 2) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return "Tidak tersedia";
  }

  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits,
  }).format(numericValue);
}

function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);

  if (days > 0) {
    return `${days} hari ${hours} jam`;
  }

  const minutes = Math.floor((seconds % 3_600) / 60);
  return `${hours} jam ${minutes} menit`;
}

function getSignalQuality(rssi: number) {
  if (rssi >= -50) return { level: 4, label: "Sangat kuat" };
  if (rssi >= -60) return { level: 3, label: "Kuat" };
  if (rssi >= -70) return { level: 2, label: "Cukup" };
  return { level: 1, label: "Lemah" };
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function getLocalDateInputValue() {
  const now = new Date();
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 10);
}

export default function Home() {
  const [sessionLoading, setSessionLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [loginError, setLoginError] = useState("");
  const [theme, setTheme] = useState<Theme>("light");
  const [reading, setReading] = useState<KwhReading | null>(null);
  const [readingLoading, setReadingLoading] = useState(true);
  const [readingRefreshing, setReadingRefreshing] = useState(false);
  const [readingError, setReadingError] = useState("");
  const [readingUpdatedAt, setReadingUpdatedAt] = useState("");

  const [topups, setTopups] = useState<TopupRecord[]>([]);
  const [topupsLoading, setTopupsLoading] = useState(true);
  const [topupsError, setTopupsError] = useState("");
  const [filterError, setFilterError] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<DateFilters>({
    startDate: "",
    endDate: "",
  });
  const [amountError, setAmountError] = useState("");
  const [topupNotice, setTopupNotice] = useState("");
  const [submittingTopup, setSubmittingTopup] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const refreshReading = useCallback(async () => {
    try {
      const response = await fetch("/api/kwh", { cache: "no-store" });
      if (response.status === 401) {
        setAuthenticated(false);
        return;
      }
      const records = await readApiData(response, isKwhList);
      setReading(records[0] ?? null);
      setReadingError("");
      setReadingUpdatedAt(new Date().toISOString());
    } catch (error) {
      setReadingError(
        error instanceof Error
          ? error.message
          : "Pembacaan KWH tidak dapat dimuat.",
      );
    } finally {
      setReadingLoading(false);
      setReadingRefreshing(false);
    }
  }, []);

  const refreshTopups = useCallback(
    async (filters: DateFilters = { startDate: "", endDate: "" }) => {
      const query = new URLSearchParams();
      if (filters.startDate) query.set("startDate", filters.startDate);
      if (filters.endDate) query.set("endDate", filters.endDate);

      try {
        const response = await fetch(`/api/topup?${query.toString()}`, {
          cache: "no-store",
        });
        if (response.status === 401) {
          setAuthenticated(false);
          return;
        }
        const records = await readApiData(response, isTopupList);
        setTopups(records);
      } catch (error) {
        setTopupsError(
          error instanceof Error
            ? error.message
            : "Riwayat top up tidak dapat dimuat.",
        );
      } finally {
        setTopupsLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const sessionCheckId = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await fetch("/api/auth/session", {
            cache: "no-store",
          });
          const payload: unknown = await response.json();

          if (
            !response.ok ||
            !isRecord(payload) ||
            typeof payload.authenticated !== "boolean"
          ) {
            throw new Error("Status login tidak dapat diperiksa.");
          }

          if (
            payload.authenticated &&
            typeof payload.deviceId === "string" &&
            DEVICE_IDS.some((id) => id === payload.deviceId)
          ) {
            setDeviceId(payload.deviceId);
            setAuthenticated(true);
          }
        } catch (error) {
          setLoginError(
            error instanceof Error
              ? error.message
              : "Status login tidak dapat diperiksa.",
          );
        } finally {
          setSessionLoading(false);
        }
      })();
    }, 0);

    return () => window.clearTimeout(sessionCheckId);
  }, []);

  useEffect(() => {
    if (!authenticated) {
      return;
    }

    const initialReadId = window.setTimeout(() => {
      void refreshReading();
    }, 0);
    const intervalId = window.setInterval(() => {
      setReadingRefreshing(true);
      void refreshReading();
    }, REFRESH_INTERVAL);

    return () => {
      window.clearTimeout(initialReadId);
      window.clearInterval(intervalId);
    };
  }, [authenticated, refreshReading]);

  useEffect(() => {
    if (!authenticated) {
      return;
    }

    const today = getLocalDateInputValue();
    const filters = { startDate: today, endDate: today };
    const initialTopupsId = window.setTimeout(() => {
      setStartDate(today);
      setEndDate(today);
      setAppliedFilters(filters);
      void refreshTopups(filters);
    }, 0);

    return () => window.clearTimeout(initialTopupsId);
  }, [authenticated, refreshTopups]);

  async function handleLogout() {
    setLoginError("");

    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        throw new Error("Logout tidak dapat dilakukan. Coba lagi.");
      }

      setAuthenticated(false);
      setDeviceId("");
      setReading(null);
      setTopups([]);
      setReadingError("");
      setTopupsError("");
      setTopupNotice("");
    } catch (error) {
      setLoginError(
        error instanceof Error
          ? error.message
          : "Logout tidak dapat dilakukan.",
      );
    }
  }

  async function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFilterError("");

    if (!startDate || !endDate) {
      setFilterError("Pilih tanggal mulai dan tanggal akhir.");
      return;
    }

    if (startDate && !isValidDate(startDate)) {
      setFilterError("Tanggal mulai tidak valid.");
      return;
    }

    if (endDate && !isValidDate(endDate)) {
      setFilterError("Tanggal akhir tidak valid.");
      return;
    }

    if (startDate && endDate && startDate > endDate) {
      setFilterError(
        "Tanggal mulai harus sebelum atau sama dengan tanggal akhir.",
      );
      return;
    }

    const filters = { startDate, endDate };
    setAppliedFilters(filters);
    setTopupsLoading(true);
    setTopupsError("");
    await refreshTopups(filters);
  }

  async function handleTodayFilter() {
    const today = getLocalDateInputValue();
    const filters = { startDate: today, endDate: today };
    setStartDate(today);
    setEndDate(today);
    setFilterError("");
    setAppliedFilters(filters);
    setTopupsLoading(true);
    setTopupsError("");
    await refreshTopups(filters);
  }

  async function handleTopupSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAmountError("");
    setTopupNotice("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    const rawAmount = formData.get("total_topup_kwh");
    const amount = typeof rawAmount === "string" ? Number(rawAmount) : NaN;

    if (!Number.isFinite(amount) || amount <= 0) {
      setAmountError("Masukkan jumlah top up lebih besar dari 0.");
      return;
    }

    setSubmittingTopup(true);

    try {
      const response = await fetch("/api/topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          total_topup_kwh: amount,
        }),
      });
      await readApiData(response, isTopupRecord);
      form.reset();
      setTopupNotice("Data top up berhasil disimpan.");
      setTopupsLoading(true);
      setTopupsError("");
      setReadingRefreshing(true);
      await Promise.all([refreshTopups(appliedFilters), refreshReading()]);
    } catch (error) {
      setAmountError(
        error instanceof Error ? error.message : "Top up tidak dapat disimpan.",
      );
    } finally {
      setSubmittingTopup(false);
    }
  }

  async function handleDeleteTopup(record: TopupRecord) {
    const createdAt = formatDateTime(record.createdAt);
    if (
      !window.confirm(
        `Hapus top up ${formatNumber(record.totalTopupKwh)} kWh pada ${createdAt}?`,
      )
    ) {
      return;
    }

    setDeletingId(record.id);
    setTopupNotice("");
    setTopupsLoading(true);
    setTopupsError("");

    try {
      const query = new URLSearchParams({ id: String(record.id) });
      const response = await fetch(`/api/topup?${query.toString()}`, {
        method: "DELETE",
      });
      await readApiData(response, (data): data is Record<string, unknown> => {
        return (
          isRecord(data) && isNumber(data.deletedCount) && data.deletedCount > 0
        );
      });
      setTopupNotice("Data top up berhasil dihapus.");
      await refreshTopups(appliedFilters);
    } catch (error) {
      setTopupsError(
        error instanceof Error
          ? error.message
          : "Data top up tidak dapat dihapus.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  function toggleTheme() {
    setTheme((currentTheme) => (currentTheme === "light" ? "dark" : "light"));
  }

  const signalQuality = reading ? getSignalQuality(reading.rssi) : null;

  if (sessionLoading) {
    return (
      <div className={`dashboard theme-${theme}`}>
        <main className="login-page">
          <p className="state-message" role="status">
            Memeriksa sesi masuk...
          </p>
        </main>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <LoginForm
        initialError={loginError}
        onLoginSuccess={(selectedDeviceId) => {
          setLoginError("");
          setDeviceId(selectedDeviceId);
          setAuthenticated(true);
        }}
      />
    );
  }

  return (
    <div className={`dashboard theme-${theme}`}>
      <a className="skip-link" href="#main-content">
        Langsung ke konten
      </a>

      <header className="topbar">
        <a
          className="brand"
          href="#dashboard"
          aria-label="Energi Rumah, halaman utama"
        >
          <span className="brand-mark text-lg" aria-hidden="true">
            💡
          </span>
          <span className="brand-copy">
            <strong>Energi Rumah</strong>
            <span>Pemantauan listrik</span>
          </span>
        </a>

        <nav className="main-nav" aria-label="Navigasi utama">
          <a href="#dashboard">Ikhtisar</a>
          <a href="#riwayat">Riwayat top up</a>
          <a href="#catat-topup">Catat top up</a>
        </nav>

        <div className="header-actions">
          {loginError && (
            <span className="error-message header-error" role="alert">
              {loginError}
            </span>
          )}
          <button
            className="theme-toggle gap-2"
            type="button"
            onClick={toggleTheme}
            aria-pressed={theme === "dark"}
          >
            {theme === "light" ? (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="size-6"
              >
                <path
                  fillRule="evenodd"
                  d="M9.528 1.718a.75.75 0 0 1 .162.819A8.97 8.97 0 0 0 9 6a9 9 0 0 0 9 9 8.97 8.97 0 0 0 3.463-.69.75.75 0 0 1 .981.98 10.503 10.503 0 0 1-9.694 6.46c-5.799 0-10.5-4.7-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 0 1 .818.162Z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="size-6"
              >
                <path d="M12 2.25a.75.75 0 0 1 .75.75v2.25a.75.75 0 0 1-1.5 0V3a.75.75 0 0 1 .75-.75ZM7.5 12a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM18.894 6.166a.75.75 0 0 0-1.06-1.06l-1.591 1.59a.75.75 0 1 0 1.06 1.061l1.591-1.59ZM21.75 12a.75.75 0 0 1-.75.75h-2.25a.75.75 0 0 1 0-1.5H21a.75.75 0 0 1 .75.75ZM17.834 18.894a.75.75 0 0 0 1.06-1.06l-1.59-1.591a.75.75 0 1 0-1.061 1.06l1.59 1.591ZM12 18a.75.75 0 0 1 .75.75V21a.75.75 0 0 1-1.5 0v-2.25A.75.75 0 0 1 12 18ZM7.758 17.303a.75.75 0 0 0-1.061-1.06l-1.591 1.59a.75.75 0 0 0 1.06 1.061l1.591-1.59ZM6 12a.75.75 0 0 1-.75.75H3a.75.75 0 0 1 0-1.5h2.25A.75.75 0 0 1 6 12ZM6.697 7.757a.75.75 0 0 0 1.06-1.06l-1.59-1.591a.75.75 0 0 0-1.061 1.06l1.59 1.591Z" />
              </svg>
            )}
            {/* {theme === "light" ? "Mode gelap" : "Mode terang"} */}
          </button>
          <button
            className="logout-button gap-2"
            type="button"
            onClick={handleLogout}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="size-6"
            >
              <path
                fillRule="evenodd"
                d="M12 2.25a.75.75 0 0 1 .75.75v9a.75.75 0 0 1-1.5 0V3a.75.75 0 0 1 .75-.75ZM6.166 5.106a.75.75 0 0 1 0 1.06 8.25 8.25 0 1 0 11.668 0 .75.75 0 1 1 1.06-1.06c3.808 3.807 3.808 9.98 0 13.788-3.807 3.808-9.98 3.808-13.788 0-3.808-3.807-3.808-9.98 0-13.788a.75.75 0 0 1 1.06 0Z"
                clipRule="evenodd"
              />
            </svg>
            <p className="hidden md:flex">Keluar</p>
          </button>
        </div>
      </header>

      <main className="dashboard-main" id="main-content">
        <section
          className="page-intro"
          id="dashboard"
          aria-labelledby="page-title"
        >
          <div>
            <p className="eyebrow">Perangkat {deviceId}</p>
            <h1 id="page-title">Pantau listrik rumah dari jarak jauh!</h1>
            <p className="intro-copy">
              Pembacaan meter terbaru dan catatan pengisian token.
            </p>
          </div>
          <div className="refresh-info">
            <span>Data KWH diperbarui otomatis tiap 3 menit</span>
            {readingUpdatedAt && (
              <span>
                Terakhir diperbarui{" "}
                {new Intl.DateTimeFormat("id-ID", {
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(readingUpdatedAt))}
              </span>
            )}
          </div>
        </section>

        <section
          className="reading-layout"
          aria-label="Pembacaan meter terbaru"
        >
          <div className="reading-panel">
            <div className="reading-panel-heading">
              <div>
                <p className="panel-kicker">Pembacaan terakhir</p>
                <h2>Saldo token KWH</h2>
              </div>
              <button
                className="text-button refresh-button"
                type="button"
                onClick={() => {
                  setReadingRefreshing(true);
                  void refreshReading();
                }}
                disabled={readingRefreshing}
              >
                {readingRefreshing ? "Memuat..." : "Perbarui sekarang"}
              </button>
            </div>

            {readingLoading && !reading ? (
              <p className="state-message" role="status">
                Memuat pembacaan meter...
              </p>
            ) : reading ? (
              <>
                <p className="reading-value font-extrabold! tracking-widest!">
                  {formatNumber(reading.tokenKwh, 3)}
                  <span>kWh</span>
                </p>
                <div className="reading-foot font-xl!">
                  <span>
                    Waktu pencatatan <strong>{reading.datetime}</strong>
                  </span>
                  <span
                    className={`sensor-state ${reading.sensorFault ? "is-fault" : "is-ok"}`}
                  >
                    {reading.sensorFault
                      ? "Sensor bermasalah"
                      : "Sensor normal"}
                  </span>
                </div>
              </>
            ) : (
              !readingError && (
                <p className="state-message">
                  Belum ada pembacaan untuk perangkat ini.
                </p>
              )
            )}

            {readingError && (
              <p className="error-message italic text-red-400!" role="alert">
                {readingError}
                {reading && " Menampilkan data terakhir yang berhasil dimuat."}
              </p>
            )}
          </div>

          <div className="reading-details">
            <div className="detail-cell">
              <span>Terpakai sejak top up</span>
              <strong>
                {reading
                  ? `${formatNumber(reading.usedKwhSinceTopup, 3)} kWh`
                  : "Belum tersedia"}
              </strong>
            </div>
            <div className="detail-cell">
              <span>Daya saat ini</span>
              <strong>
                {reading
                  ? `${formatNumber(reading.power, 0)} W`
                  : "Belum tersedia"}
              </strong>
            </div>
            <div className="detail-cell">
              <span>Sinyal (RSSI)</span>
              {reading ? (
                <>
                  <div className="signal-reading">
                    <svg
                      className="wifi-indicator"
                      viewBox="0 0 32 32"
                      role="img"
                      aria-label={`Kekuatan sinyal ${signalQuality?.label}`}
                    >
                      <path
                        className={
                          signalQuality && signalQuality.level >= 4
                            ? "is-active"
                            : ""
                        }
                        d="M3 11.5a19 19 0 0 1 26 0"
                      />
                      <path
                        className={
                          signalQuality && signalQuality.level >= 3
                            ? "is-active"
                            : ""
                        }
                        d="M7.5 16a12.5 12.5 0 0 1 17 0"
                      />
                      <path
                        className={
                          signalQuality && signalQuality.level >= 2
                            ? "is-active"
                            : ""
                        }
                        d="M11.5 20a6.5 6.5 0 0 1 9 0"
                      />
                      <circle
                        className={
                          signalQuality && signalQuality.level >= 1
                            ? "is-active"
                            : ""
                        }
                        cx="16"
                        cy="25"
                        r="1.7"
                      />
                    </svg>
                    <strong>{formatNumber(reading.rssi, 0)} dBm</strong>
                  </div>
                  <span className="signal-quality text-2xl">
                    {signalQuality?.label}
                  </span>
                </>
              ) : (
                <strong>Belum tersedia</strong>
              )}
            </div>
            <div className="detail-cell">
              <span>Uptime perangkat</span>
              <strong>
                {reading ? formatUptime(reading.uptime) : "Belum tersedia"}
              </strong>
            </div>
          </div>
        </section>

        <section
          className="history-section"
          id="riwayat"
          aria-labelledby="history-title"
        >
          <div className="section-heading">
            <div>
              <p className="panel-kicker">Catatan perangkat</p>
              <h2 id="history-title">Riwayat top up</h2>
            </div>
            <p>Gunakan rentang tanggal untuk menyaring catatan.</p>
          </div>

          <form className="filter-form" onSubmit={handleFilterSubmit}>
            <label>
              <span>Dari tanggal</span>
              <input
                type="date"
                required
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </label>
            <label>
              <span>Sampai tanggal</span>
              <input
                type="date"
                required
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
            <div className="filter-actions">
              <button
                className="primary-button"
                type="submit"
                disabled={topupsLoading}
              >
                {topupsLoading ? "Memuat..." : "Terapkan filter"}
              </button>
              <button
                className="text-button border! border-gray-300!"
                type="button"
                onClick={() => void handleTodayFilter()}
                disabled={topupsLoading}
              >
                Hari ini
              </button>
            </div>
          </form>

          {filterError && (
            <p className="error-message" role="alert">
              {filterError}
            </p>
          )}
          {topupNotice && (
            <p className="success-message" role="status">
              {topupNotice}
            </p>
          )}
          {topupsError && (
            <p className="error-message" role="alert">
              {topupsError}
            </p>
          )}

          <div className="table-wrap">
            <table className="topup-table">
              <caption className="visually-hidden">
                Daftar riwayat top up token KWH
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    <div className="flex items-center gap-2">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="size-6"
                      >
                        <path
                          fillRule="evenodd"
                          d="M6.75 2.25A.75.75 0 0 1 7.5 3v1.5h9V3A.75.75 0 0 1 18 3v1.5h.75a3 3 0 0 1 3 3v11.25a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3V7.5a3 3 0 0 1 3-3H6V3a.75.75 0 0 1 .75-.75Zm13.5 9a1.5 1.5 0 0 0-1.5-1.5H5.25a1.5 1.5 0 0 0-1.5 1.5v7.5a1.5 1.5 0 0 0 1.5 1.5h13.5a1.5 1.5 0 0 0 1.5-1.5v-7.5Z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <p>Tanggal</p>
                    </div>
                  </th>
                  <th scope="col">
                    <div className="flex items-center gap-2">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="size-6"
                      >
                        <path
                          fillRule="evenodd"
                          d="M14.615 1.595a.75.75 0 0 1 .359.852L12.982 9.75h7.268a.75.75 0 0 1 .548 1.262l-10.5 11.25a.75.75 0 0 1-1.272-.71l1.992-7.302H3.75a.75.75 0 0 1-.548-1.262l10.5-11.25a.75.75 0 0 1 .913-.143Z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <p>Jumlah Topup</p>
                    </div>
                  </th>
                  <th scope="col">
                    <span className="visually-hidden">Aksi</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {topupsLoading ? (
                  <tr>
                    <td className="table-state" colSpan={3} role="status">
                      Memuat riwayat top up...
                    </td>
                  </tr>
                ) : topups.length === 0 ? (
                  <tr>
                    <td className="table-state" colSpan={3}>
                      {topupsError
                        ? "Riwayat belum dapat ditampilkan."
                        : startDate || endDate
                          ? "Tidak ada top up pada rentang tanggal ini."
                          : "Belum ada catatan top up untuk perangkat ini."}
                    </td>
                  </tr>
                ) : (
                  topups.map((record) => (
                    <tr key={record.id}>
                      <td data-label="Tanggal">
                        {formatDateTime(record.createdAt)}
                      </td>
                      <td data-label="Jumlah top up">
                        <strong>
                          {formatNumber(record.totalTopupKwh)} kWh
                        </strong>
                      </td>
                      <td className="table-action-cell" data-label="Aksi">
                        <button
                          className="delete-button"
                          type="button"
                          onClick={() => void handleDeleteTopup(record)}
                          disabled={deletingId === record.id}
                          aria-label={`Hapus top up ${formatNumber(record.totalTopupKwh)} kWh tanggal ${formatDateTime(record.createdAt)}`}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            className="size-6 mr-2"
                          >
                            <path
                              fillRule="evenodd"
                              d="M16.5 4.478v.227a48.816 48.816 0 0 1 3.878.512.75.75 0 1 1-.256 1.478l-.209-.035-1.005 13.07a3 3 0 0 1-2.991 2.77H8.084a3 3 0 0 1-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 0 1-.256-1.478A48.567 48.567 0 0 1 7.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 0 1 3.369 0c1.603.051 2.815 1.387 2.815 2.951Zm-6.136-1.452a51.196 51.196 0 0 1 3.273 0C14.39 3.05 15 3.684 15 4.478v.113a49.488 49.488 0 0 0-6 0v-.113c0-.794.609-1.428 1.364-1.452Zm-.355 5.945a.75.75 0 1 0-1.5.058l.347 9a.75.75 0 1 0 1.499-.058l-.346-9Zm5.48.058a.75.75 0 1 0-1.498-.058l-.347 9a.75.75 0 0 0 1.5.058l.345-9Z"
                              clipRule="evenodd"
                            />
                          </svg>
                          {deletingId === record.id ? "Menghapus..." : "Hapus"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section
          className="add-section"
          id="catat-topup"
          aria-labelledby="add-title"
        >
          <div className="section-heading add-heading">
            <div>
              <p className="panel-kicker">Pencatatan manual</p>
              <h2 id="add-title">Tambah top up</h2>
            </div>
            <p>Catatan akan dikirim ke perangkat {deviceId}.</p>
          </div>

          <form className="topup-form" onSubmit={handleTopupSubmit}>
            <label htmlFor="total_topup_kwh">Jumlah top up</label>
            <div className="amount-input-row">
              <input
                id="total_topup_kwh"
                name="total_topup_kwh"
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                placeholder="Contoh: 150.25"
                required
                aria-describedby="amount-help amount-feedback"
              />
              <span aria-hidden="true">kWh</span>
              <button
                className="primary-button"
                type="submit"
                disabled={submittingTopup}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="size-6 mr-2"
                >
                  <path
                    fillRule="evenodd"
                    d="M11.47 2.47a.75.75 0 0 1 1.06 0l4.5 4.5a.75.75 0 0 1-1.06 1.06l-3.22-3.22V16.5a.75.75 0 0 1-1.5 0V4.81L8.03 8.03a.75.75 0 0 1-1.06-1.06l4.5-4.5ZM3 15.75a.75.75 0 0 1 .75.75v2.25a1.5 1.5 0 0 0 1.5 1.5h13.5a1.5 1.5 0 0 0 1.5-1.5V16.5a.75.75 0 0 1 1.5 0v2.25a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3V16.5a.75.75 0 0 1 .75-.75Z"
                    clipRule="evenodd"
                  />
                </svg>
                <p>{submittingTopup ? "Menyimpan..." : "Simpan top up"}</p>
              </button>
            </div>
            <span className="field-help" id="amount-help">
              Masukkan jumlah sesuai nilai top up pada meter.
            </span>
            <span
              className={amountError ? "error-message" : "success-message"}
              id="amount-feedback"
              role={amountError ? "alert" : "status"}
            >
              {amountError}
            </span>
          </form>
        </section>
      </main>

      <footer className="page-footer">
        <span>Perangkat aktif: {deviceId}</span>
        <span>Interval pembaruan KWH: 3 menit</span>
      </footer>
    </div>
  );
}
