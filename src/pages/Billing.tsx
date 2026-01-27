import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Check, CreditCard, Download, RefreshCw, Zap, AlertCircle, ExternalLink, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { PLANS, PlanKey, formatCurrency, calculateOverage, OVERAGE_RATE_CENTS } from "@/lib/billing";
import { TrialInviteSection } from "@/components/billing/TrialInviteSection";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";

export default function Billing() {
  const { currentCompany } = useCompany();
  const { isAgencyAdmin } = useAuth();
  const [searchParams] = useSearchParams();
  const {
    subscription,
    usage,
    currentPlanConfig,
    checkSubscription,
    startCheckout,
    openCustomerPortal,
  } = useSubscription();

  const [checkoutLoading, setCheckoutLoading] = useState<PlanKey | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  // Handle success/cancel from checkout
  useEffect(() => {
    if (searchParams.get("success") === "true") {
      toast.success("Subscription activated successfully!");
      checkSubscription();
    } else if (searchParams.get("canceled") === "true") {
      toast.info("Checkout was canceled");
    }
  }, [searchParams, checkSubscription]);

  const handleUpgrade = async (planKey: PlanKey) => {
    try {
      setCheckoutLoading(planKey);
      await startCheckout(planKey);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start checkout");
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleManageSubscription = async () => {
    try {
      setPortalLoading(true);
      await openCustomerPortal();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to open billing portal");
    } finally {
      setPortalLoading(false);
    }
  };

  if (!currentCompany) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Please select a company to view billing</p>
      </div>
    );
  }

  const callsUsedPercent = subscription.callsLimit > 0 
    ? Math.min(100, (usage.callsCount / subscription.callsLimit) * 100)
    : 0;
  
  const minutesUsedPercent = subscription.minutesLimit > 0
    ? Math.min(100, (usage.minutesCount / subscription.minutesLimit) * 100)
    : 0;

  const estimatedOverage = calculateOverage(usage.minutesCount, subscription.minutesLimit);

  // Non-agency admins see limited billing info
  if (!isAgencyAdmin) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold">Subscription</h1>
          <p className="text-muted-foreground">Your plan details for {currentCompany.name}</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Current Plan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {subscription.isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : subscription.subscribed ? (
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="text-lg px-4 py-1">
                  {subscription.plan === 'pro' ? 'Pro' : 'Starter'}
                </Badge>
                <Badge variant="outline">Active</Badge>
              </div>
            ) : (
              <Alert>
                <ShieldAlert className="h-4 w-4" />
                <AlertDescription>
                  No active subscription. Contact your administrator.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Usage only - no pricing */}
        <Card>
          <CardHeader>
            <CardTitle>Current Usage</CardTitle>
            <CardDescription>This billing period</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {usage.isLoading || subscription.isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : subscription.subscribed ? (
              <>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Calls Used</span>
                    <span className="font-medium">
                      {usage.callsCount} / {subscription.callsLimit}
                    </span>
                  </div>
                  <Progress 
                    value={callsUsedPercent} 
                    className={`h-2 ${callsUsedPercent >= 90 ? "[&>div]:bg-destructive" : ""}`} 
                  />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Minutes Used</span>
                    <span className="font-medium">
                      {usage.minutesCount} / {subscription.minutesLimit}
                    </span>
                  </div>
                  <Progress 
                    value={minutesUsedPercent} 
                    className={`h-2 ${minutesUsedPercent >= 90 ? "[&>div]:bg-destructive" : ""}`}
                  />
                </div>
              </>
            ) : (
              <p className="text-muted-foreground text-center py-4">
                Subscribe to a plan to track usage
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Billing</h1>
          <p className="text-muted-foreground">Manage your subscription and usage for {currentCompany.name}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => checkSubscription()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Subscription Status Alert */}
      {!subscription.isLoading && !subscription.subscribed && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No active subscription. AI receptionist features are limited. Choose a plan below to activate full features.
          </AlertDescription>
        </Alert>
      )}

      {/* Current Plan & Usage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Current Plan */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Current Plan
            </CardTitle>
            <CardDescription>
              {subscription.subscribed && subscription.subscriptionEnd
                ? `Renews on ${new Date(subscription.subscriptionEnd).toLocaleDateString()}`
                : "No active subscription"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {subscription.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
            ) : subscription.subscribed && currentPlanConfig ? (
              <>
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="text-lg px-4 py-1">
                    {currentPlanConfig.name}
                  </Badge>
                  <span className="text-2xl font-bold">${currentPlanConfig.price}/mo</span>
                </div>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>• {currentPlanConfig.calls_limit} calls/month</li>
                  <li>• {currentPlanConfig.minutes_limit} minutes/month</li>
                </ul>
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={handleManageSubscription}
                  disabled={portalLoading}
                >
                  {portalLoading ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4 mr-2" />
                  )}
                  Manage Subscription
                </Button>
              </>
            ) : (
              <div className="text-center py-4">
                <p className="text-muted-foreground mb-4">No active subscription</p>
                <Zap className="h-12 w-12 mx-auto text-muted-foreground/50" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Usage */}
        <Card>
          <CardHeader>
            <CardTitle>Current Usage</CardTitle>
            <CardDescription>This billing period</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {usage.isLoading || subscription.isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : subscription.subscribed ? (
              <>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Calls Used</span>
                    <span className="font-medium">
                      {usage.callsCount} / {subscription.callsLimit}
                    </span>
                  </div>
                  <Progress 
                    value={callsUsedPercent} 
                    className={`h-2 ${callsUsedPercent >= 90 ? "[&>div]:bg-destructive" : ""}`} 
                  />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>Minutes Used</span>
                    <span className="font-medium">
                      {usage.minutesCount} / {subscription.minutesLimit}
                    </span>
                  </div>
                  <Progress 
                    value={minutesUsedPercent} 
                    className={`h-2 ${minutesUsedPercent >= 90 ? "[&>div]:bg-destructive" : ""}`}
                  />
                </div>
                {estimatedOverage > 0 && (
                  <div className="pt-2 border-t">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Estimated Overage</span>
                      <span className="font-medium text-destructive">
                        {formatCurrency(estimatedOverage)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      ${(OVERAGE_RATE_CENTS / 100).toFixed(2)} per additional minute
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-muted-foreground text-center py-4">
                Subscribe to a plan to track usage
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Plans */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Available Plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {(Object.entries(PLANS) as [PlanKey, typeof PLANS.starter][]).map(([key, plan]) => {
            const isCurrentPlan = subscription.plan === key;
            const isPro = key === "pro";

            return (
              <Card
                key={key}
                className={`relative ${isPro ? "border-primary ring-2 ring-primary" : ""} ${
                  isCurrentPlan ? "bg-muted/50" : ""
                }`}
              >
                {isPro && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground">MOST POPULAR</Badge>
                  </div>
                )}
                {isCurrentPlan && (
                  <div className="absolute -top-3 right-4">
                    <Badge variant="secondary">YOUR PLAN</Badge>
                  </div>
                )}
                <CardHeader className="pt-6">
                  <CardTitle className="text-2xl">{plan.name}</CardTitle>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-display font-bold">${plan.price}</span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                  <CardDescription>
                    {plan.calls_limit} calls • {plan.minutes_limit} minutes included
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-sm">
                        <Check className="h-4 w-4 text-primary flex-shrink-0" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full"
                    variant={isCurrentPlan ? "outline" : isPro ? "default" : "outline"}
                    disabled={isCurrentPlan || checkoutLoading !== null}
                    onClick={() => handleUpgrade(key)}
                  >
                    {checkoutLoading === key ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : null}
                    {isCurrentPlan ? "Current Plan" : `Upgrade to ${plan.name}`}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Overage Info */}
      <Card>
        <CardHeader>
          <CardTitle>Overage Pricing</CardTitle>
          <CardDescription>When you exceed your plan limits</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <div>
              <p className="font-medium">Per-Minute Overage Rate</p>
              <p className="text-sm text-muted-foreground">
                Charged at the end of each billing cycle
              </p>
            </div>
            <div className="text-2xl font-bold">${(OVERAGE_RATE_CENTS / 100).toFixed(2)}/min</div>
          </div>
        </CardContent>
      </Card>

      {/* Invoices (Placeholder) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Invoices
          </CardTitle>
          <CardDescription>Download your past invoices</CardDescription>
        </CardHeader>
        <CardContent>
          {subscription.subscribed ? (
            <div className="space-y-2">
              <Button variant="outline" className="w-full justify-start" onClick={handleManageSubscription}>
                <Download className="h-4 w-4 mr-2" />
                View & Download Invoices in Billing Portal
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">
              No invoices available
            </p>
          )}
        </CardContent>
      </Card>

      {/* Trial Invites Section - Agency Admin Only */}
      <Separator className="my-8" />
      <TrialInviteSection />
    </motion.div>
  );
}
