"use client";
import { useRef } from "react";

export function PauseButton({ disabled, onPause }) {
  const dialog = useRef(null);
  return (
    <>
      <button
        className="link"
        disabled={disabled}
        onClick={() => dialog.current.showModal()}
      >
        体験を中断
      </button>
      <dialog
        className="company-modal panel"
        ref={dialog}
        aria-labelledby="pause-heading"
        aria-describedby="pause-details"
      >
        <div className="modal-inner">
          <h2 id="pause-heading">体験を中断しますか？</h2>
          <p id="pause-details">
            ここまでの回答と入力中の理由を保存します。このタブの企業一覧から、同じ場面に戻れます。
          </p>
          <form method="dialog">
            <button className="primary" autoFocus>
              体験を続ける
            </button>
            <button
              className="link pause-confirm"
              type="button"
              onClick={() => {
                dialog.current.close();
                onPause();
              }}
            >
              保存して中断する
            </button>
          </form>
        </div>
      </dialog>
    </>
  );
}
