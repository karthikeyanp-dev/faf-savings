import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, getDocs, doc, getDoc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/providers/AuthProvider';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectItem } from '@/components/ui/select';
import type { MemberDoc, UserDoc, AppConfig } from '@/types';
import { toast } from 'sonner';

import { StaggerContainer, StaggerItem, TapScale } from '@/components/animations/PageTransition';
import { 
  CreditCard, 
  Users, 
  Crown, 
  QrCode, 
  Plus, 
  Power, 
  PowerOff,

  Upload
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function SettingsPage() {
  const { user, isMaintainer } = useAuth();
  const queryClient = useQueryClient();
  const [newMemberName, setNewMemberName] = useState('');

  const { data: config } = useQuery({
    queryKey: ['config'],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'config', 'app'));
      return snap.data() as AppConfig;
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'members'));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as MemberDoc));
    },
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'users'));
      return snap.docs.map((d) => ({ uid: d.id, ...d.data() } as UserDoc));
    },
  });

  const handleUpdatePaymentDetails = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const upiId = formData.get('upiId') as string;
    const bankDetails = formData.get('bankDetails') as string;

    try {
      await updateDoc(doc(db, 'config', 'app'), {
        upiId: upiId || null,
        bankDetails: bankDetails || null,
        updatedAt: serverTimestamp(),
        updatedByUid: user!.uid,
      });
      toast.success('Payment details updated');
      queryClient.invalidateQueries({ queryKey: ['config'] });
    } catch (error: any) {
      toast.error(error.message || 'Failed to update');
    }
  };

  const handleQRUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (limit to 1MB for base64)
    if (file.size > 1024 * 1024) {
      toast.error('Image too large. Please use an image under 1MB.');
      return;
    }

    try {
      // Convert to base64
      const reader = new FileReader();
      reader.onload = async (event) => {
        const base64 = event.target?.result as string;

        await updateDoc(doc(db, 'config', 'app'), {
          qrUrl: base64,
          updatedAt: serverTimestamp(),
          updatedByUid: user!.uid,
        });

        toast.success('QR code uploaded');
        queryClient.invalidateQueries({ queryKey: ['config'] });
      };
      reader.readAsDataURL(file);
    } catch (error: any) {
      toast.error(error.message || 'Failed to upload QR');
    }
  };

  const handleAddMember = async () => {
    if (!newMemberName.trim()) return;

    try {
      await addDoc(collection(db, 'members'), {
        name: newMemberName.trim(),
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      toast.success('Member added');
      setNewMemberName('');
      queryClient.invalidateQueries({ queryKey: ['members'] });
    } catch (error: any) {
      toast.error(error.message || 'Failed to add member');
    }
  };

  const handleToggleMember = async (member: MemberDoc) => {
    try {
      await updateDoc(doc(db, 'members', member.id), {
        active: !member.active,
        updatedAt: serverTimestamp(),
      });
      toast.success(`Member ${member.active ? 'deactivated' : 'activated'}`);
      queryClient.invalidateQueries({ queryKey: ['members'] });
    } catch (error: any) {
      toast.error(error.message || 'Failed to update member');
    }
  };

  const handleMaintainerHandover = async (newMaintainerUid: string) => {
    try {
      await updateDoc(doc(db, 'config', 'app'), {
        currentMaintainerUid: newMaintainerUid,
        updatedAt: serverTimestamp(),
        updatedByUid: user!.uid,
      });

      // Update user roles
      await updateDoc(doc(db, 'users', user!.uid), { role: 'viewer', updatedAt: serverTimestamp() });
      await updateDoc(doc(db, 'users', newMaintainerUid), { role: 'maintainer', updatedAt: serverTimestamp() });

      toast.success('Maintainer handover complete');
      queryClient.invalidateQueries({ queryKey: ['config'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (error: any) {
      toast.error(error.message || 'Failed to handover');
    }
  };

  // Mobile Member Card
  const MemberCard = ({ member }: { member: MemberDoc }) => (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center',
              member.active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
            )}>
              {member.active ? <Power className="h-5 w-5" /> : <PowerOff className="h-5 w-5" />}
            </div>
            <div>
              <p className="font-semibold">{member.name}</p>
              <Badge variant={member.active ? 'default' : 'secondary'} className="text-[10px] mt-0.5">
                {member.active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
          </div>
          {isMaintainer && (
            <TapScale scale={0.95}>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleToggleMember(member)}
                className={cn(
                  member.active && 'text-orange-600 border-orange-200 hover:bg-orange-50'
                )}
              >
                {member.active ? 'Deactivate' : 'Activate'}
              </Button>
            </TapScale>
          )}
        </div>
      </CardContent>
    </Card>
  );

  // Settings Section Card
  const SettingsSection = ({ 
    title, 
    description, 
    icon: Icon, 
    children,
    className
  }: { 
    title: string; 
    description?: string; 
    icon: React.ElementType; 
    children: React.ReactNode;
    className?: string;
  }) => (
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

  return (
    <AppLayout>
      <div className="space-y-6">
        <StaggerContainer className="space-y-4">
          {/* Payment Details */}
          <StaggerItem>
            <SettingsSection 
              title="Payment Details" 
              description="UPI and bank details for contributions"
              icon={CreditCard}
            >
              <form onSubmit={handleUpdatePaymentDetails} className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">UPI ID</Label>
                  <Input
                    name="upiId"
                    defaultValue={config?.upiId || ''}
                    placeholder="example@upi"
                    disabled={!isMaintainer}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">Bank Details</Label>
                  <Input
                    name="bankDetails"
                    defaultValue={config?.bankDetails || ''}
                    placeholder="Bank name, account number, IFSC"
                    disabled={!isMaintainer}
                    className="mt-1.5"
                  />
                </div>
                {isMaintainer && (
                  <Button type="submit" className="w-full">
                    Update Payment Details
                  </Button>
                )}
              </form>
            </SettingsSection>
          </StaggerItem>

          {/* QR Upload */}
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
                      <span className="text-sm text-muted-foreground">Tap to upload QR code (max 1MB)</span>
                    </label>
                  </div>
                  {config?.qrUrl && (
                    <div className="flex justify-center">
                      <div className="p-4 bg-white rounded-xl shadow-sm">
                        <img src={config.qrUrl} alt="QR Code" className="w-40 h-40 object-contain" />
                      </div>
                    </div>
                  )}
                </div>
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
                  {/* Add Member */}
                  <div className="flex gap-2">
                    <Input
                      placeholder="New member name"
                      value={newMemberName}
                      onChange={(e) => setNewMemberName(e.target.value)}
                      className="flex-1"
                    />
                    <Button onClick={handleAddMember} size="icon" className="shrink-0">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Mobile: Card List */}
                  <div className="lg:hidden space-y-2">
                    {members.map((member) => (
                      <MemberCard key={member.id} member={member} />
                    ))}
                  </div>

                  {/* Desktop: Table */}
                  <div className="hidden lg:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {members.map((member) => (
                          <TableRow key={member.id}>
                            <TableCell className="font-medium">{member.name}</TableCell>
                            <TableCell>
                              <Badge variant={member.active ? 'default' : 'secondary'}>
                                {member.active ? 'Active' : 'Inactive'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button 
                                variant="outline" 
                                size="sm" 
                                onClick={() => handleToggleMember(member)}
                              >
                                {member.active ? 'Deactivate' : 'Activate'}
                              </Button>
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
                    if (window.confirm('Are you sure you want to transfer maintainer role?')) {
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
              <SettingsSection 
                title="Current Maintainer" 
                icon={Crown}
              >
                <div className="flex items-center gap-3 p-3 bg-muted rounded-xl">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Crown className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">
                      {users.find((u) => u.uid === config.currentMaintainerUid)?.displayName || 'Unknown'}
                    </p>
                    <p className="text-sm text-muted-foreground">Pool Maintainer</p>
                  </div>
                </div>
              </SettingsSection>
            </StaggerItem>
          )}

          {/* App Info */}
          <StaggerItem>
            <Card className="bg-muted/50">
              <CardContent className="p-4 text-center">
                <p className="text-sm text-muted-foreground">FaF Savings v1.0</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Financial management made simple
                </p>
              </CardContent>
            </Card>
          </StaggerItem>
        </StaggerContainer>
      </div>
    </AppLayout>
  );
}
