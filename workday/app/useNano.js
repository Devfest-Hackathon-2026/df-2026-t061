"use client";
import { useEffect, useRef, useState } from "react";
import { generateLocal, nanoStatus } from "../lib/decision";

export function useNano() {
  const [status, setStatus] = useState("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const job = useRef(null);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => { if (live) setStatus("unknown"); }, 10000);
    nanoStatus().then(value => {
      clearTimeout(timer);
      if (live) setStatus(value);
    });
    return () => {
      live = false;
      clearTimeout(timer);
      job.current?.abort();
      job.current = null;
    };
  }, []);
  async function run(kind, data, accept) {
    if (job.current) return;
    const control = new AbortController();
    job.current = control;
    setBusy(true);
    setError("");
    const timer = setTimeout(() => control.abort(), 180000);
    try {
      const result = await generateLocal(kind, data, control.signal);
      if (job.current === control && !control.signal.aborted) {
        accept(result);
        setStatus("available");
      }
    } catch {
      if (job.current === control)
        setError("端末内の生成が完了しませんでした。Chromeのモデルの準備状況をご確認ください。");
    } finally {
      clearTimeout(timer);
      if (job.current === control) { job.current = null; setBusy(false); }
    }
  }
  return { run, busy, error, status };
}
