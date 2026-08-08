import { ChangeEvent, useId, useState } from "react";
import { api } from "../api";
import { useToast } from "./Toast";

type BaseProps = {
  label: string;
  required?: boolean;
  accept?: string;
  hint?: string;
};

type SingleProps = BaseProps & {
  multiple?: false;
  value: string;
  onChange: (url: string) => void;
};

type MultiProps = BaseProps & {
  multiple: true;
  value: string[];
  onChange: (urls: string[]) => void;
};

type Props = SingleProps | MultiProps;

export function FileUploadField(props: Props) {
  const {
    label,
    required = false,
    accept = "image/*,.pdf,application/pdf",
    hint,
    multiple = false,
  } = props;
  const inputId = useId();
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [fileNames, setFileNames] = useState<Record<string, string>>({});

  const urls = multiple ? (props as MultiProps).value : [(props as SingleProps).value].filter(Boolean);
  const hasFiles = urls.length > 0;

  async function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!selected.length) return;

    const files = multiple ? selected : selected.slice(0, 1);
    setUploading(true);
    try {
      const uploaded: Array<{ url: string; name: string }> = [];
      for (const file of files) {
        const result = await api.uploadFile(file);
        uploaded.push({ url: result.url, name: file.name });
      }

      if (multiple) {
        const next = [...(props as MultiProps).value, ...uploaded.map((u) => u.url)];
        (props as MultiProps).onChange(next);
        setFileNames((prev) => {
          const copy = { ...prev };
          for (const u of uploaded) copy[u.url] = u.name;
          return copy;
        });
        toast.success(
          uploaded.length === 1
            ? `${uploaded[0].name} uploaded`
            : `${uploaded.length} files uploaded`,
        );
      } else {
        const first = uploaded[0];
        (props as SingleProps).onChange(first.url);
        setFileNames({ [first.url]: first.name });
        toast.success(`${first.name} uploaded`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function removeAt(url: string) {
    if (multiple) {
      (props as MultiProps).onChange((props as MultiProps).value.filter((u) => u !== url));
      setFileNames((prev) => {
        const copy = { ...prev };
        delete copy[url];
        return copy;
      });
      return;
    }
    (props as SingleProps).onChange("");
    setFileNames({});
  }

  function clearAll() {
    if (multiple) {
      (props as MultiProps).onChange([]);
    } else {
      (props as SingleProps).onChange("");
    }
    setFileNames({});
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
          multiple={multiple}
          required={required && !hasFiles}
          disabled={uploading}
          onChange={handleChange}
        />
        <div className="file-upload-row">
          <label
            htmlFor={inputId}
            className={`btn btn-ghost btn-sm file-upload-btn${uploading ? " is-busy" : ""}`}
          >
            {uploading
              ? "Uploading…"
              : multiple
                ? hasFiles
                  ? "Add more files"
                  : "Choose files"
                : hasFiles
                  ? "Replace file"
                  : "Choose file"}
          </label>
          {hasFiles && !multiple ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearAll} disabled={uploading}>
              Remove
            </button>
          ) : null}
          {hasFiles && multiple ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearAll} disabled={uploading}>
              Clear all
            </button>
          ) : null}
          {uploading && !hasFiles ? (
            <div className="file-upload-status">Uploading…</div>
          ) : null}
          {!multiple && hasFiles && !uploading ? (
            <div className="file-upload-status is-ready">
              <span>{fileNames[urls[0]] || "File uploaded"}</span>
              {" · "}
              <a href={urls[0]} target="_blank" rel="noreferrer">
                View
              </a>
            </div>
          ) : null}
        </div>

        {multiple && hasFiles ? (
          <ul className="file-upload-list">
            {urls.map((url, index) => (
              <li key={url}>
                <span>
                  {fileNames[url] || `File ${index + 1}`}
                  {" · "}
                  <a href={url} target="_blank" rel="noreferrer">
                    View
                  </a>
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => removeAt(url)}
                  disabled={uploading}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        {hint ? <p className="file-upload-hint">{hint}</p> : null}
      </div>
    </div>
  );
}
