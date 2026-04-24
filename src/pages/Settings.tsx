import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/providers/AuthProvider";
import { AppLayout } from "@/components/layout/AppLayout";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectItem } from "@/components/ui/select";
import {
  formatINR,
  getCurrentFY,
  getTotalOpeningBalance,
} from "@/utils/financialYear";
import type { MemberDoc, UserDoc, AppConfig } from "@/types";
import { toast } from "sonner";

import {
  StaggerContainer,
  StaggerItem,
  TapScale,
} from "@/components/animations/PageTransition";
import { EditMemberDialog } from "@/components/transactions/EditMemberDialog";
import { AddMemberDialog } from "@/components/transactions/AddMemberDialog";
import { SetOpeningBalanceDialog } from "@/components/transactions/SetOpeningBalanceDialog";
import {
  CreditCard,
  Users,
  Crown,
  QrCode,
  Plus,
  Power,
  PowerOff,
  Pencil,
  Mail,
  Upload,
  Copy,
  Building2,
  Download,
  Wallet,
  Bell,
  BellOff,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotifications } from "@/hooks/useNotifications";
import { Switch } from "@/components/ui/switch";
import type { TransactionType } from "@/types";

// Settings Section Card — defined outside SettingsPage to avoid re-mount on state change
function SettingsSection({
  title,
  description,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  description?: string;
  icon: React.ElementType;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

// Mobile Member Card — defined outside SettingsPage to avoid re-mount on state change
function MemberCard({
  member,
  onEdit,
  onToggle,
  isMaintainer,
}: {
  member: MemberDoc;
  onEdit: () => void;
  onToggle: () => void;
  isMaintainer: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center",
                member.active
                  ? "bg-primary/10 text-primary"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {member.active ? (
                <Power className="h-5 w-5" />
              ) : (
                <PowerOff className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold truncate">{member.name}</p>
                <Badge
                  variant={member.active ? "default" : "secondary"}
                  className="text-[10px] shrink-0"
                >
                  {member.active ? "Active" : "Inactive"}
                </Badge>
              </div>
              {member.email && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 min-w-0 hidden sm:flex">
                  <Mail className="h-3 w-3 shrink-0" />
                  <span className="truncate">{member.email}</span>
                </p>
              )}
            </div>
          </div>
          {isMaintainer && (
            <div className="flex items-center gap-2 shrink-0">
              <TapScale scale={0.95}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onEdit}
                  className="h-8 w-8"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </TapScale>
              <TapScale scale={0.95}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onToggle}
                  className={cn(
                    "h-8 w-8",
                    member.active
                      ? "text-orange-500 hover:text-orange-600 hover:bg-orange-50"
                      : "text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50",
                  )}
                >
                  {member.active ? (
                    <PowerOff className="h-4 w-4" />
                  ) : (
                    <Power className="h-4 w-4" />
                  )}
                </Button>
              </TapScale>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
  const { user, isMaintainer } = useAuth();
  const notifications = useNotifications();
  const queryClient = useQueryClient();
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [editingMember, setEditingMember] = useState<MemberDoc | null>(null);
  const [isOpeningBalanceOpen, setIsOpeningBalanceOpen] = useState(false);
  const currentFY = getCurrentFY();

  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: async () => {
      const snap = await getDoc(doc(db, "config", "app"));
      return snap.data() as AppConfig;
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["members"],
    queryFn: async () => {
      const snap = await getDocs(collection(db, "members"));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as MemberDoc);
    },
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const snap = await getDocs(collection(db, "users"));
      return snap.docs.map((d) => ({ uid: d.id, ...d.data() }) as UserDoc);
    },
  });

  const openingBalances = members.map((m) => {
    const amount = config?.openingBalances?.[m.id] ?? 0;
    return { member: m, amount };
  });
  const totalOpeningBalance = getTotalOpeningBalance(config?.openingBalances);
  const openingInterest = config?.openingInterest ?? 0;

  const handleUpdatePaymentDetails = async (
    e: React.FormEvent<HTMLFormElement>,
  ) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const upiId = formData.get("upiId") as string;
    const bankDetails = formData.get("bankDetails") as string;

    try {
      await updateDoc(doc(db, "config", "app"), {
        upiId: upiId || null,
        bankDetails: bankDetails || null,
        updatedAt: serverTimestamp(),
        updatedByUid: user!.uid,
      });
      toast.success("Payment details updated");
      queryClient.invalidateQueries({ queryKey: ["config"] });
    } catch (error: any) {
      toast.error(error.message || "Failed to update");
    }
  };

  const handleQRUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024) {
      toast.error("Image too large. Please use an image under 1MB.");
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;

        await updateDoc(doc(db, "config", "app"), {
          qrUrl: base64,
          updatedAt: serverTimestamp(),
          updatedByUid: user!.uid,
        });

        toast.success("QR code uploaded");
        queryClient.invalidateQueries({ queryKey: ["config"] });
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      toast.error(error.message || "Failed to upload QR");
    }
  };

  const handleToggleMember = async (member: MemberDoc) => {
    try {
      await updateDoc(doc(db, "members", member.id), {
        active: !member.active,
        updatedAt: serverTimestamp(),
      });
      toast.success(`Member ${member.active ? "deactivated" : "activated"}`);
      queryClient.invalidateQueries({ queryKey: ["members"] });
    } catch (error: any) {
      toast.error(error.message || "Failed to update member");
    }
  };

  const handleMaintainerHandover = async (newMaintainerUid: string) => {
    try {
      await updateDoc(doc(db, "config", "app"), {
        currentMaintainerUid: newMaintainerUid,
        updatedAt: serverTimestamp(),
        updatedByUid: user!.uid,
      });

      await updateDoc(doc(db, "users", user!.uid), {
        role: "viewer",
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "users", newMaintainerUid), {
        role: "maintainer",
        updatedAt: serverTimestamp(),
      });

      toast.success("Maintainer handover complete");
      queryClient.invalidateQueries({ queryKey: ["config"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
    } catch (error: any) {
      toast.error(error.message || "Failed to handover");
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <StaggerContainer className="space-y-4">
          {/* Payment Details — Maintainer: editable form */}
          {isMaintainer && (
            <StaggerItem>
              <SettingsSection
                title="Payment Details"
                description="UPI and bank details for contributions"
                icon={CreditCard}
              >
                <form
                  onSubmit={handleUpdatePaymentDetails}
                  className="space-y-4"
                >
                  <div>
                    <Label className="text-sm font-medium">UPI ID</Label>
                    <Input
                      name="upiId"
                      defaultValue={config?.upiId || ""}
                      placeholder="example@upi"
                      className="mt-1.5"
                    />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Bank Details</Label>
                    <Input
                      name="bankDetails"
                      defaultValue={config?.bankDetails || ""}
                      placeholder="Bank name, account number, IFSC"
                      className="mt-1.5"
                    />
                  </div>
                  <Button type="submit" className="w-full">
                    Update Payment Details
                  </Button>
                </form>
              </SettingsSection>
            </StaggerItem>
          )}

          {/* QR Upload — Maintainer only */}
          {isMaintainer && (
            <StaggerItem>
              <SettingsSection
                title="QR Code"
                description="Payment QR code for quick transfers"
                icon={QrCode}
              >
                <div className="space-y-4">
                  <div className="relative">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleQRUpload}
                      className="hidden"
                      id="qr-upload"
                    />
                    <label
                      htmlFor="qr-upload"
                      className="flex items-center justify-center gap-2 w-full p-4 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
                    >
                      <Upload className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        Tap to upload QR code (max 1MB)
                      </span>
                    </label>
                  </div>
                  {config?.qrUrl && (
                    <div className="flex justify-center">
                      <div className="p-4 bg-white rounded-xl shadow-sm">
                        <img
                          src={config.qrUrl}
                          alt="QR Code"
                          className="w-40 h-40 object-contain"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </SettingsSection>
            </StaggerItem>
          )}

          {/* Payment Information — Viewer: read-only card */}
          {!isMaintainer && (
            <StaggerItem>
              <SettingsSection
                title="Payment Information"
                description="Use these details to make your contributions"
                icon={CreditCard}
              >
                {config?.qrUrl || config?.upiId || config?.bankDetails ? (
                  <div className="space-y-4">
                    {/* QR Code */}
                    {config?.qrUrl && (
                      <div className="flex flex-col items-center gap-3 pb-5 border-b border-border/50">
                        <div className="p-4 bg-white rounded-2xl shadow-sm border border-border/30">
                          <img
                            src={config.qrUrl}
                            alt="Payment QR"
                            className="w-44 h-44 object-contain"
                          />
                        </div>
                        <a
                          href={config.qrUrl}
                          download="payment-qr.png"
                          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download QR
                        </a>
                      </div>
                    )}

                    {/* UPI ID */}
                    <div className="flex items-center gap-3 p-3.5 bg-muted/50 rounded-xl border border-border/50">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <CreditCard className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                          UPI ID
                        </p>
                        <p className="font-semibold text-sm text-foreground truncate mt-0.5">
                          {config?.upiId ? (
                            config.upiId
                          ) : (
                            <span className="text-muted-foreground font-normal">
                              Not set
                            </span>
                          )}
                        </p>
                      </div>
                      {config?.upiId && (
                        <TapScale scale={0.9}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              navigator.clipboard.writeText(config.upiId!);
                              toast.success("UPI ID copied");
                            }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </TapScale>
                      )}
                    </div>

                    {/* Bank Details */}
                    <div className="flex items-start gap-3 p-3.5 bg-muted/50 rounded-xl border border-border/50">
                      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Building2 className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                          Bank Details
                        </p>
                        <p className="text-sm leading-relaxed whitespace-pre-line text-foreground mt-0.5">
                          {config?.bankDetails ? (
                            config.bankDetails
                          ) : (
                            <span className="text-muted-foreground font-normal">
                              Not set
                            </span>
                          )}
                        </p>
                      </div>
                      {config?.bankDetails && (
                        <TapScale scale={0.9} className="self-start mt-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              navigator.clipboard.writeText(
                                config.bankDetails!,
                              );
                              toast.success("Bank details copied");
                            }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </TapScale>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                    <CreditCard className="h-10 w-10 opacity-25" />
                    <p className="text-sm">No payment details added yet</p>
                  </div>
                )}
              </SettingsSection>
            </StaggerItem>
          )}

          {/* Member Management */}
          {isMaintainer && (
            <StaggerItem>
              <SettingsSection
                title="Manage Members"
                description="Add or toggle member status"
                icon={Users}
              >
                <div className="space-y-4">
                  {/* Add Member Button */}
                  <div className="flex justify-end">
                    <TapScale scale={0.95}>
                      <Button
                        size="icon"
                        onClick={() => setIsAddingMember(true)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </TapScale>
                  </div>

                  {/* Mobile: Card List */}
                  <div className="lg:hidden space-y-2">
                    {members.map((member) => (
                      <MemberCard
                        key={member.id}
                        member={member}
                        onEdit={() => setEditingMember(member)}
                        onToggle={() => {
                          const action = member.active
                            ? "deactivate"
                            : "activate";
                          if (
                            window.confirm(
                              `Are you sure you want to ${action} ${member.name}?`,
                            )
                          ) {
                            handleToggleMember(member);
                          }
                        }}
                        isMaintainer={isMaintainer}
                      />
                    ))}
                  </div>

                  {/* Desktop: Table */}
                  <div className="hidden lg:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {members.map((member) => (
                          <TableRow key={member.id}>
                            <TableCell className="font-medium">
                              {member.name}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {member.email || "—"}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  member.active ? "default" : "secondary"
                                }
                              >
                                {member.active ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setEditingMember(member)}
                                  className="h-8 w-8"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const action = member.active
                                      ? "deactivate"
                                      : "activate";
                                    if (
                                      window.confirm(
                                        `Are you sure you want to ${action} ${member.name}?`,
                                      )
                                    ) {
                                      handleToggleMember(member);
                                    }
                                  }}
                                >
                                  {member.active ? "Deactivate" : "Activate"}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </SettingsSection>
            </StaggerItem>
          )}

          {/* Previous Balances */}
          {isMaintainer && (
            <StaggerItem>
              <SettingsSection
                title="Previous Balances"
                description={`Accumulated balances from before FY ${currentFY}`}
                icon={Wallet}
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                    <div>
                      <p className="text-sm font-medium">
                        Total Previous Balance
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {openingBalances.filter((ob) => ob.amount !== 0).length}{" "}
                        of {members.length} members
                      </p>
                    </div>
                    <p className="text-lg font-bold">
                      {formatINR(totalOpeningBalance)}
                    </p>
                  </div>

                  <div className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                    <div>
                      <p className="text-sm font-medium">Opening Interest</p>
                      <p className="text-xs text-muted-foreground">
                        Added directly to pool balance
                      </p>
                    </div>
                    <p className="text-lg font-bold">
                      {formatINR(openingInterest)}
                    </p>
                  </div>

                  {openingBalances.filter((ob) => ob.amount !== 0).length >
                    0 && (
                    <div className="space-y-2">
                      {openingBalances
                        .filter((ob) => ob.amount !== 0)
                        .map((ob) => (
                          <div
                            key={ob.member.id}
                            className="flex items-center justify-between py-1.5"
                          >
                            <div className="flex items-center gap-2">
                              <div
                                className={cn(
                                  "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold",
                                  ob.member.active
                                    ? "bg-primary/10 text-primary"
                                    : "bg-muted text-muted-foreground",
                                )}
                              >
                                {ob.member.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-sm">{ob.member.name}</span>
                            </div>
                            <span
                              className={cn(
                                "text-sm font-medium",
                                ob.amount !== 0
                                  ? "text-foreground"
                                  : "text-muted-foreground",
                              )}
                            >
                              {ob.amount !== 0 ? formatINR(ob.amount) : "—"}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}

                  <Button
                    className="w-full"
                    onClick={() => setIsOpeningBalanceOpen(true)}
                  >
                    Set Previous Balances
                  </Button>
                </div>
              </SettingsSection>
            </StaggerItem>
          )}

          {/* Maintainer Handover */}
          {isMaintainer && (
            <StaggerItem>
              <SettingsSection
                title="Maintainer Handover"
                description="Transfer maintainer role to another user"
                icon={Crown}
              >
                <Select
                  value=""
                  onValueChange={(uid) => {
                    if (
                      window.confirm(
                        "Are you sure you want to transfer maintainer role?",
                      )
                    ) {
                      handleMaintainerHandover(uid);
                    }
                  }}
                >
                  <SelectItem value="">Select new maintainer...</SelectItem>
                  {users
                    .filter((u) => u.uid !== user?.uid && u.active)
                    .map((u) => (
                      <SelectItem key={u.uid} value={u.uid}>
                        {u.displayName} ({u.email})
                      </SelectItem>
                    ))}
                </Select>
              </SettingsSection>
            </StaggerItem>
          )}

          {/* Current Maintainer (Viewer view) */}
          {!isMaintainer && config && (
            <StaggerItem>
              <SettingsSection title="Current Maintainer" icon={Crown}>
                <div className="flex items-center gap-3 p-3 bg-muted rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Crown className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">
                      {users.find((u) => u.uid === config.currentMaintainerUid)
                        ?.displayName || "Unknown"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Pool Maintainer
                    </p>
                  </div>
                </div>
              </SettingsSection>
            </StaggerItem>
          )}

          {/* Notifications */}
          {isMaintainer ? (
            <StaggerItem>
              <SettingsSection
                title="Notifications"
                description="Push notification settings"
                icon={Bell}
              >
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                  <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
                    <BellOff className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">Maintainer Account</p>
                    <p className="text-xs text-muted-foreground">
                      Notifications are for viewer accounts. As the maintainer, you make the changes.
                    </p>
                  </div>
                </div>
              </SettingsSection>
            </StaggerItem>
          ) : (
            <StaggerItem>
              <SettingsSection
                title="Notifications"
                description="Get notified about transaction updates"
                icon={Bell}
              >
                <div className="space-y-4">
                  {/* Permission denied state */}
                  {notifications.permission === 'denied' && (
                    <div className="flex items-start gap-3 p-3 bg-destructive/10 rounded-xl border border-destructive/20">
                      <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-destructive">Notifications Blocked</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          To receive notifications, please enable them in your browser settings:
                          go to Site Settings &rarr; Notifications &rarr; Allow.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Enable/Disable toggle */}
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium">Push Notifications</p>
                      <p className="text-xs text-muted-foreground">
                        {notifications.permission === 'default'
                          ? 'Tap to enable and allow notifications'
                          : notifications.permission === 'denied'
                            ? 'Blocked by browser settings'
                            : notifications.prefs.enabled
                              ? 'Notifications are active'
                              : 'Notifications are paused'}
                      </p>
                    </div>
                    <Switch
                      checked={notifications.prefs.enabled}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          notifications.enableNotifications();
                        } else {
                          notifications.disableNotifications();
                        }
                      }}
                      disabled={notifications.permission === 'denied'}
                    />
                  </div>

                  {/* Type preferences — only shown when enabled */}
                  {notifications.prefs.enabled && (
                    <>
                      <div className="pt-2 border-t border-border/50">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
                          Notify me about
                        </p>
                        <div className="space-y-3">
                          {([
                            ['deposit', 'Deposits', 'Money added to the pool'],
                            ['withdrawal', 'Withdrawals', 'Money taken from the pool'],
                            ['return', 'Returns', 'Funds returned to members'],
                            ['interest', 'Interest', 'Interest added to pool balance'],
                            ['opening_balance', 'Balance Updates', 'Previous balance adjustments'],
                          ] as [TransactionType, string, string][]).map(([type, label, desc]) => (
                            <div key={type} className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium">{label}</p>
                                <p className="text-xs text-muted-foreground">{desc}</p>
                              </div>
                              <Switch
                                checked={notifications.prefs[type]}
                                onCheckedChange={() => notifications.toggleTypePref(type)}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </SettingsSection>
            </StaggerItem>
          )}

          {/* App Info */}
          <StaggerItem>
            <Card className="bg-muted/50">
              <CardContent className="p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  FaF Savings v1.0
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Financial management made simple
                </p>
              </CardContent>
            </Card>
          </StaggerItem>
        </StaggerContainer>
      </div>

      {/* Add Member Dialog */}
      <AddMemberDialog
        open={isAddingMember}
        onClose={() => setIsAddingMember(false)}
      />

      {/* Edit Member Dialog */}
      {editingMember && (
        <EditMemberDialog
          member={editingMember}
          open
          onClose={() => setEditingMember(null)}
        />
      )}

      {/* Set Previous Balance Dialog */}
      <SetOpeningBalanceDialog
        open={isOpeningBalanceOpen}
        onClose={() => setIsOpeningBalanceOpen(false)}
      />
    </AppLayout>
  );
}
