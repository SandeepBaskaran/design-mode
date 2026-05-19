"use client";

import { useState } from "react";

import Link from "next/link";

import { Check, ChevronsUpDown, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface FeatureSection {
  category: string;
  features: {
    name: string;
    local: true | false | null | string;
    cloud: true | false | null | string;
    selfHosted: true | false | null | string;
  }[];
}

const REPO_URL = "https://github.com/SandeepBaskaran/design-mode";

const pricingPlans = [
  {
    name: "Cloud",
    button: { text: "How Cloud works", variant: "outline" as const, href: "/mcp" as const, external: false },
  },
  {
    name: "Local",
    button: { text: "Setup guide", variant: "outline" as const, href: "/mcp" as const, external: false },
  },
  {
    name: "Self-hosted",
    button: {
      text: "View on GitHub",
      variant: "outline" as const,
      href: `${REPO_URL}/tree/main/packages/mcp-cloud`,
      external: true as const,
    },
  },
];

const comparisonFeatures: FeatureSection[] = [
  {
    category: "Setup",
    features: [
      {
        name: "Install command",
        local: "npx @design-mode/mcp-local",
        cloud: "no install",
        selfHosted: "deploy to Vercel",
      },
      {
        name: "Bearer token required",
        local: false,
        cloud: true,
        selfHosted: true,
      },
      {
        name: "Auto-connects on panel open",
        local: true,
        cloud: false,
        selfHosted: false,
      },
    ],
  },
  {
    category: "Privacy",
    features: [
      {
        name: "Network egress from your machine",
        local: false,
        cloud: true,
        selfHosted: true,
      },
      {
        name: "Edits persisted server-side",
        local: false,
        cloud: false,
        selfHosted: "your call",
      },
      {
        name: "Payload bodies dropped within ~60s",
        local: "n/a",
        cloud: true,
        selfHosted: true,
      },
      {
        name: "Anyone else operates the infra",
        local: false,
        cloud: true,
        selfHosted: false,
      },
    ],
  },
  {
    category: "Agent compatibility",
    features: [
      {
        name: "Claude Desktop",
        local: true,
        cloud: true,
        selfHosted: true,
      },
      {
        name: "Cursor",
        local: true,
        cloud: true,
        selfHosted: true,
      },
      {
        name: "Claude Code",
        local: true,
        cloud: true,
        selfHosted: true,
      },
      {
        name: "Agents in remote / sandboxed contexts",
        local: false,
        cloud: true,
        selfHosted: true,
      },
    ],
  },
  {
    category: "Cost",
    features: [
      {
        name: "Price",
        local: "Free",
        cloud: "Free",
        selfHosted: "Free + your Vercel bill",
      },
    ],
  },
];

const renderFeatureValue = (value: true | false | null | string) => {
  if (value === true) {
    return <Check className="size-5" />;
  }
  if (value === false) {
    return <X className="size-5" />;
  }
  if (value === null) {
    return null;
  }
  return (
    <div className="flex items-center gap-2">
      <Check className="size-4" />
      <span className="text-muted-foreground">{value}</span>
    </div>
  );
};

export const ModesComparison = () => {
  const [selectedPlan, setSelectedPlan] = useState(0); // Default to Cloud mode

  return (
    <section className="pb-28 lg:py-32">
      <div className="container">
        <PlanHeaders
          selectedPlan={selectedPlan}
          onPlanChange={setSelectedPlan}
        />
        <FeatureSections selectedPlan={selectedPlan} />
      </div>
    </section>
  );
};

const PlanHeaders = ({
  selectedPlan,
  onPlanChange,
}: {
  selectedPlan: number;
  onPlanChange: (index: number) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const renderCta = (plan: (typeof pricingPlans)[number]) =>
    plan.button.external ? (
      <a href={plan.button.href} target="_blank" rel="noopener noreferrer">
        <Button variant={plan.button.variant}>{plan.button.text}</Button>
      </a>
    ) : (
      <Link href={plan.button.href}>
        <Button variant={plan.button.variant}>{plan.button.text}</Button>
      </Link>
    );

  return (
    <div>
      {/* Mobile View */}
      <div className="md:hidden">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <div className="flex items-center justify-between border-b py-4">
            <CollapsibleTrigger className="flex items-center gap-2">
              <h3 className="text-2xl font-semibold">
                {pricingPlans[selectedPlan].name}
              </h3>
              <ChevronsUpDown
                className={`size-5 transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </CollapsibleTrigger>
            {renderCta(pricingPlans[selectedPlan])}
          </div>
          <CollapsibleContent className="flex flex-col space-y-2 p-2">
            {pricingPlans.map(
              (plan, index) =>
                index !== selectedPlan && (
                  <Button
                    size="lg"
                    variant="secondary"
                    key={index}
                    onClick={() => {
                      onPlanChange(index);
                      setIsOpen(false);
                    }}
                  >
                    {plan.name}
                  </Button>
                ),
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Desktop View */}
      <div className="grid grid-cols-4 gap-4 max-md:hidden">
        <div className="col-span-1 max-md:hidden"></div>

        {pricingPlans.map((plan, index) => (
          <div key={index}>
            <h3 className="mb-3 text-2xl font-semibold">{plan.name}</h3>
            {renderCta(plan)}
          </div>
        ))}
      </div>
    </div>
  );
};

const FeatureSections = ({ selectedPlan }: { selectedPlan: number }) => (
  <>
    {comparisonFeatures.map((section, sectionIndex) => (
      <div key={sectionIndex}>
        <div className="border-primary/40 border-b py-4">
          <h3 className="text-lg font-semibold">{section.category}</h3>
        </div>
        {section.features.map((feature, featureIndex) => (
          <div
            key={featureIndex}
            className="text-foreground grid grid-cols-2 font-medium max-md:border-b md:grid-cols-4"
          >
            <span className="inline-flex items-center py-4">
              {feature.name}
            </span>
            {/* Mobile View - Only Selected Plan */}
            <div className="md:hidden">
              <div className="flex items-center gap-1 py-4 md:border-b">
                {renderFeatureValue(
                  [feature.cloud, feature.local, feature.selfHosted][
                    selectedPlan
                  ],
                )}
              </div>
            </div>
            {/* Desktop View - All Modes */}
            <div className="hidden md:col-span-3 md:grid md:grid-cols-3 md:gap-4">
              {[feature.cloud, feature.local, feature.selfHosted].map(
                (value, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1 border-b py-4"
                  >
                    {renderFeatureValue(value)}
                  </div>
                ),
              )}
            </div>
          </div>
        ))}
      </div>
    ))}
  </>
);
