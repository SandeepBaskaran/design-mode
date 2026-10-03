import type { ReactNode } from "react";

import Image from "next/image";

import { ArrowRight, Code2, MousePointer2, Terminal } from "lucide-react";

import styles from "./agent-workflow.module.css";

function WorkflowWindow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-border bg-background w-full rounded-2xl border md:w-auto md:flex-1">
      <div className="border-border flex items-center gap-2 border-b px-6 py-4">
        {[0, 1, 2].map((dot) => (
          <span key={dot} aria-hidden="true" className="bg-muted-foreground/30 size-2 rounded-full" />
        ))}
        <span className="text-muted-foreground ml-3 text-base">{title}</span>
      </div>
      <div className="px-8 py-10">{children}</div>
    </div>
  );
}

export function AgentWorkflow() {
  return (
    <section aria-labelledby="agent-workflow-heading" className="py-32">
      <div className="container flex flex-col items-center justify-start">
        <div className="mx-0 w-full max-w-[980px] text-center">
          <p className="text-muted-foreground text-base font-medium tracking-widest uppercase">
            A shared picture. A precise handoff.
          </p>
          <h2 id="agent-workflow-heading" className="mt-6 w-full text-2xl tracking-tight md:text-4xl lg:text-5xl">
            Show your agent what needs to change.
          </h2>
          <p className="text-muted-foreground mx-auto mt-6 max-w-[640px] text-base leading-relaxed">
            Make visual edits on the live page. Design Mode captures the details
            so your coding agent can work from the changes, not a description of
            them.
          </p>
        </div>

        <div className="mx-auto mt-16 flex w-full max-w-5xl flex-col items-center md:mt-24 md:flex-row md:items-stretch">
          <WorkflowWindow title="Your browser">
            <Image src="/brand-icon.png" width={40} height={40} alt="" unoptimized />
            <h3 className="mt-6 text-2xl font-medium tracking-tight">Design Mode</h3>
            <p className="text-muted-foreground mt-3 text-base leading-relaxed">
              Select an element. Adjust the design. Record exactly what changed.
            </p>
            <div className="text-muted-foreground mt-8 flex items-center gap-2 text-base">
              <MousePointer2 aria-hidden="true" className="size-4" />
              Visual edits + page context
            </div>
          </WorkflowWindow>

          <div className="flex h-32 shrink-0 flex-col items-center justify-center md:h-auto md:w-40">
            <span className="text-muted-foreground text-base font-medium tracking-widest">MCP</span>
            <div aria-hidden="true" className="bg-border relative mt-3 h-12 w-px md:h-px md:w-full">
              <ArrowRight className={`text-muted-foreground size-4 ${styles.arrow}`} />
            </div>
            <span className="text-muted-foreground mt-3 text-base">Exact change details</span>
          </div>

          <WorkflowWindow title="Your coding agent">
            <Terminal aria-hidden="true" className="size-10 stroke-1" />
            <h3 className="mt-6 text-2xl font-medium tracking-tight">Your coding agent</h3>
            <p className="text-muted-foreground mt-3 text-base leading-relaxed">
              Reads the captured changes and updates the source in your project.
            </p>
            <div className="text-muted-foreground mt-8 flex items-center gap-2 text-base">
              <Code2 aria-hidden="true" className="size-4" />
              <span className="text-base">Your codebase. A diff you can review.</span>
            </div>
          </WorkflowWindow>
        </div>


      </div>
    </section>
  );
}
