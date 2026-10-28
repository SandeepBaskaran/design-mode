"use client";

import { ArrowRight, ChevronDown, Copy, RotateCcw } from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";

type Primitive = "button" | "card" | "accordion" | "carousel" | "collapsible" | "navigation-menu";

const VARIANTS = ["default", "ink", "outline", "secondary", "ghost", "link", "destructive"] as const;
const SIZES = ["sm", "default", "lg"] as const;

export function UiPrimitives({ only }: { only: Primitive }) {
  if (only === "button") {
    return (
      <div className="space-y-6">
        {SIZES.map((size) => (
          <div key={size} className="flex flex-wrap items-center gap-3">
            <span className="text-muted-foreground w-16 text-xs">{size}</span>
            {VARIANTS.map((v) => (
              <Button key={v} variant={v} size={size}>
                {v}
              </Button>
            ))}
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-muted-foreground w-16 text-xs">states</span>
          <Button>
            Continue <ArrowRight />
          </Button>
          <Button disabled>Disabled</Button>
          <Button size="icon" aria-label="Copy">
            <Copy />
          </Button>
          <Button size="icon-sm" variant="outline" aria-label="Reset">
            <RotateCcw />
          </Button>
          <Button size="icon-lg" variant="secondary" aria-label="Copy">
            <Copy />
          </Button>
        </div>
      </div>
    );
  }
  if (only === "card") {
    return (
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>CardTitle</CardTitle>
            <CardDescription>CardDescription</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">CardContent</CardContent>
          <CardFooter>
            <Button size="sm">CardFooter action</Button>
          </CardFooter>
        </Card>
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Raised</CardTitle>
            <CardDescription>shadow-lg override</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">Default cards use shadow-sm.</CardContent>
        </Card>
      </div>
    );
  }
  if (only === "accordion") {
    return (
      <Accordion type="single" collapsible className="px-1">
        <AccordionItem value="a">
          <AccordionTrigger>AccordionTrigger</AccordionTrigger>
          <AccordionContent>AccordionContent</AccordionContent>
        </AccordionItem>
        <AccordionItem value="b">
          <AccordionTrigger>Second item</AccordionTrigger>
          <AccordionContent>More content.</AccordionContent>
        </AccordionItem>
      </Accordion>
    );
  }
  if (only === "carousel") {
    return (
      <div className="px-12">
        <Carousel>
          <CarouselContent>
            {[1, 2, 3, 4, 5].map((n) => (
              <CarouselItem key={n} className="basis-1/2 md:basis-1/3">
                <div className="bg-secondary flex h-28 items-center justify-center rounded-lg text-lg font-semibold">{n}</div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious />
          <CarouselNext />
        </Carousel>
      </div>
    );
  }
  if (only === "collapsible") {
    return (
      <Collapsible className="max-w-md">
        <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold">
          CollapsibleTrigger <ChevronDown className="size-4" />
        </CollapsibleTrigger>
        <CollapsibleContent className="text-muted-foreground mt-2 text-sm">CollapsibleContent</CollapsibleContent>
      </Collapsible>
    );
  }
  return (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Product</NavigationMenuTrigger>
          <NavigationMenuContent>
            <div className="grid w-64 gap-1 p-2">
              <NavigationMenuLink href="#">Features</NavigationMenuLink>
              <NavigationMenuLink href="#">Use cases</NavigationMenuLink>
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink href="#">Docs</NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}
