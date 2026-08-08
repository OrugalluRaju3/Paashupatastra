import { ChangeEvent, useId, useState } from "react";
import { api } from "../api";
import { useToast } from "./Toast";

type Props = {
  label: string;
  value: string;
  onChange: (url: string) => void;
  required?: boolean;
  accept?: string;
  hint?: string;
};

export function FileUploadField({
  label,
  value,
  onChange,
  required = false,
  accept = "image/*,.pdf,application/pdf",
  hint,
}: Props) {
  const inputId = useId();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState("");

  async function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    try {
      const result = await api.uploadFile(file);
      onChange(result.url);
      setFileName(file.name);
      toast.success(`${file.name} uploaded`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function clearFile() {
    onChange("");
    setFileName("");
  }

  return (
    <div className="field">
      <label htmlFor={inputId}>
        {label}
        {required ? " *" : ""}
      </label>
      <div className="file-upload">
        <input
          id={inputId}
          type="file"
          accept={accept}
          required={required && !value}
          disabled={uploading}
          onChange={handleChange}
        />
        <div className="file-upload-row">
          <label htmlFor={inputId} className={`btn btn-ghost btn-sm file-upload-btn${uploading ? " is-busy" : ""}`}>
            {uploading ? "Uploading…" : value ? "Replace file" : "Choose file"}
          </label>
          {value ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearFile} disabled={uploading}>
              Remove
            </button>
          ) : null}
          {uploading || value ? (
            <div className={`file-upload-status${value && !uploading ? " is-ready" : ""}`}>
              {uploading ? (
                "Uploading…"
              ) : (
                <>
                  <span>{fileName || "File uploaded"}</span>
                  {" · "}
                  <a href={value} target="_blank" rel="noreferrer">
                    View
                  </a>
                </>
              )}
            </div>
          ) : null}
        </div>
        {hint ? <p className="file-upload-hint">{hint}</p> : null}
      </div>
    </div>
  );
}
