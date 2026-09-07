"use client";

import * as React from "react";
import { Focus, MoveHorizontal, MoveVertical, RefreshCw, Trash2, ZoomIn } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import type { FateCharacter } from "@/lib/fate";
import { prepareSheetImage } from "@/lib/sheet-image";
import type { TableConfig } from "@/lib/table-config";

type SheetImageValue = FateCharacter["optional"]["image"];

export function SheetImage({
  image,
  name,
  shape,
  editable,
  onChange,
}: {
  image: SheetImageValue;
  name: string;
  shape: TableConfig["sheetStructure"]["imageShape"];
  editable: boolean;
  onChange?: (image: SheetImageValue) => void;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [draft, setDraft] = React.useState(image);

  React.useEffect(() => {
    const handle = window.setTimeout(() => setDraft(image), 0);
    return () => window.clearTimeout(handle);
  }, [image]);

  const chooseFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !onChange) return;
    setBusy(true);
    try {
      const prepared = await prepareSheetImage(file);
      setDraft(prepared);
      onChange(prepared);
      toast.success("Imagem da Ficha pronta.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "A imagem não pôde ser preparada.");
    } finally {
      setBusy(false);
    }
  };

  const shown = draft?.dataUrl === image?.dataUrl ? draft : image;

  const changeFraming = (next: Partial<NonNullable<SheetImageValue>>, commit = false) => {
    if (!shown) return;
    const value = { ...shown, ...next };
    setDraft(value);
    if (commit) onChange?.(value);
  };

  return (
    <section className="sheet-image-block" data-shape={shape} data-empty={!shown}>
      <div className="sheet-image-frame">
        {shown ? (
          // A imagem já foi preparada localmente e pertence ao arquivo exportável da Ficha.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shown.dataUrl}
            alt={shown.alt || (name ? `Imagem de ${name}` : "Imagem da Ficha")}
            style={{
              objectPosition: `${shown.positionX}% ${shown.positionY}%`,
              transform: `scale(${shown.zoom})`,
              transformOrigin: `${shown.positionX}% ${shown.positionY}%`,
            }}
          />
        ) : editable ? (
          <button className="sheet-image-placeholder" type="button" disabled={busy} onClick={() => input.current?.click()}>
            <Focus aria-hidden="true" />
            <b>Imagem da Ficha</b>
            <span>{busy ? "Preparando a imagem…" : "Escolher imagem"}</span>
          </button>
        ) : (
          <div className="sheet-image-placeholder">
            <Focus aria-hidden="true" />
            <b>Imagem da Ficha</b>
            <span>Opcional. A Ficha continua completa sem ela.</span>
          </div>
        )}

        {editable && shown && (
          <Button className="sheet-image-pick" type="button" variant={shown ? "secondary" : "default"} disabled={busy} onClick={() => input.current?.click()}>
            <RefreshCw /> {busy ? "Preparando…" : "Substituir"}
          </Button>
        )}
        {editable && <input ref={input} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseFile} />}
      </div>

      {editable && shown && (
        <div className="sheet-image-controls">
          <div className="framing-control"><MoveHorizontal aria-hidden="true" /><Label htmlFor="image-horizontal">Mover para os lados</Label><Slider id="image-horizontal" min={0} max={100} step={1} value={[shown.positionX]} onValueChange={([positionX]) => changeFraming({ positionX })} onValueCommit={([positionX]) => changeFraming({ positionX }, true)} /></div>
          <div className="framing-control"><MoveVertical aria-hidden="true" /><Label htmlFor="image-vertical">Mover para cima ou para baixo</Label><Slider id="image-vertical" min={0} max={100} step={1} value={[shown.positionY]} onValueChange={([positionY]) => changeFraming({ positionY })} onValueCommit={([positionY]) => changeFraming({ positionY }, true)} /></div>
          <div className="framing-control"><ZoomIn aria-hidden="true" /><Label htmlFor="image-zoom">Aproximar</Label><Slider id="image-zoom" min={1} max={2.5} step={0.05} value={[shown.zoom]} onValueChange={([zoom]) => changeFraming({ zoom })} onValueCommit={([zoom]) => changeFraming({ zoom }, true)} /></div>
          <Label className="field-stack image-alt-field"><span>Descrição da imagem</span><Input value={shown.alt} maxLength={240} placeholder="O que aparece na imagem?" onChange={(event) => changeFraming({ alt: event.target.value })} onBlur={() => onChange?.(shown)} /></Label>
          <Button type="button" variant="ghost" size="sm" onClick={() => { setDraft(null); onChange?.(null); }}><Trash2 /> Remover imagem</Button>
        </div>
      )}
    </section>
  );
}
