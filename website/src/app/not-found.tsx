import Link from "next/link";

import { ArrowLeft } from "lucide-react";

import { Background } from "@/components/background";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <Background>
      <div className="container flex min-h-[70vh] flex-col items-center justify-center py-28 text-center lg:min-h-[80vh] lg:py-32">
        <div className="relative z-10 max-w-2xl">
          <h1 className="from-foreground to-foreground/70 relative mb-6 bg-linear-to-br bg-clip-text py-2 text-5xl font-bold text-transparent sm:text-6xl lg:text-7xl">
            Page not found
          </h1>

          <p className="text-muted-foreground mb-10 text-xl">
            That URL didn't lead anywhere on designmode.app. It may have moved
            or never existed.
          </p>

          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button asChild size="lg" className="group min-w-[200px] gap-2">
              <Link href="/">
                <ArrowLeft className="size-5 transition-transform group-hover:-translate-x-1" />
                Back home
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              className="min-w-[200px]"
            >
              <Link href="/contact">Get in touch</Link>
            </Button>
          </div>
        </div>
      </div>
    </Background>
  );
}
