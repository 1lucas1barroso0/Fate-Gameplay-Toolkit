"use client";
import * as React from "react";
import { Textarea } from "@/components/ui/textarea";

export function GrowingTextarea(props: React.ComponentProps<"textarea">) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useLayoutEffect(() => {
    const field = ref.current;
    if (!field || CSS.supports("field-sizing", "content")) return;
    const resize = () => { field.style.height = "auto"; field.style.height = `${field.scrollHeight + 2}px`; };
    resize();
    let width = field.clientWidth;
    const observer = new ResizeObserver(() => { if (width !== field.clientWidth) { width = field.clientWidth; resize(); } });
    observer.observe(field);
    return () => observer.disconnect();
  }, [props.value]);
  return <Textarea {...props} ref={ref} className={`growing-rule-text ${props.className ?? ""}`} rows={props.rows ?? 4} />;
}
