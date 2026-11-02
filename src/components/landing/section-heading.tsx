import { Reveal } from "./reveal";

export function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body?: string;
}) {
  return (
    <Reveal className="mx-auto mb-14 flex max-w-2xl flex-col items-center gap-3 text-center">
      <p className="text-sm font-medium text-primary">{eyebrow}</p>
      <h2 className="text-3xl font-semibold tracking-tight text-balance md:text-4xl">{title}</h2>
      {body ? <p className="text-lg text-muted-foreground text-pretty">{body}</p> : null}
    </Reveal>
  );
}
