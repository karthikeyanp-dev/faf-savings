import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatINR, calculateMemberNet } from '@/utils/financialYear';
import type { MemberDoc, TransactionDoc } from '@/types';
import { ChevronDown, Search, Filter, X, ArrowUpRight, ArrowDownRight, Wallet } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { StaggerContainer, StaggerItem, TapScale } from '@/components/animations/PageTransition';
import { Input } from '@/components/ui/input';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { cn } from '@/lib/utils';

// Mobile Member Card
function MemberCard({
  member,
  net,
  totalDeposit,
  totalReturn,
  totalWithdrawal,
  receivable,
  isExpanded,
  onToggle,
}: {
  member: MemberDoc;
  net: number;
  totalDeposit: number;
  totalReturn: number;
  totalWithdrawal: number;
  receivable: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <Card className="overflow-hidden">
      <TapScale scale={0.99}>
        <div
          className="p-4 cursor-pointer"
          onClick={onToggle}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold',
                member.active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              )}>
                {member.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold text-lg">{member.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <Badge variant={member.active ? 'default' : 'secondary'} className="text-[10px]">
                    {member.active ? 'Active' : 'Inactive'}
                  </Badge>
                  <span className={cn(
                    'text-sm font-medium',
                    net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                  )}>
                    {net >= 0 ? '+' : ''}{formatINR(net)}
                  </span>
                </div>
              </div>
            </div>
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            </motion.div>
          </div>
        </div>
      </TapScale>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="px-4 pb-4 border-t border-border">
              <div className="grid grid-cols-2 gap-3 pt-4">
                <div className="bg-green-50 dark:bg-green-950/30 p-3 rounded-xl">
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-1">
                    <ArrowUpRight className="h-4 w-4" />
                    <span className="text-xs font-medium">Deposited</span>
                  </div>
                  <p className="text-lg font-bold">{formatINR(totalDeposit)}</p>
                </div>
                <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-xl">
                  <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-1">
                    <Wallet className="h-4 w-4" />
                    <span className="text-xs font-medium">Returned</span>
                  </div>
                  <p className="text-lg font-bold">{formatINR(totalReturn)}</p>
                </div>
                <div className="bg-orange-50 dark:bg-orange-950/30 p-3 rounded-xl">
                  <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 mb-1">
                    <ArrowDownRight className="h-4 w-4" />
                    <span className="text-xs font-medium">Withdrawn</span>
                  </div>
                  <p className="text-lg font-bold">{formatINR(totalWithdrawal)}</p>
                </div>
                <div className={cn(
                  'p-3 rounded-xl',
                  receivable > 0 ? 'bg-red-50 dark:bg-red-950/30' : 'bg-muted'
                )}>
                  <div className={cn(
                    'flex items-center gap-2 mb-1',
                    receivable > 0 ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
                  )}>
                    <span className="text-xs font-medium">Receivable</span>
                  </div>
                  <p className="text-lg font-bold">{formatINR(receivable)}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

export function MembersPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [expandedMember, setExpandedMember] = useState<string | null>(null);

  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'members'));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as MemberDoc));
    },
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'transactions'));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TransactionDoc));
    },
  });

  const activeTransactions = transactions.filter((t) => t.status === 'active');

  // Filter members
  const filteredMembers = members
    .filter((m) => {
      if (statusFilter === 'active') return m.active;
      if (statusFilter === 'inactive') return !m.active;
      return true;
    })
    .filter((m) => 
      searchQuery === '' || m.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Search and Filter Bar */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
          <BottomSheet
            open={filterOpen}
            onOpenChange={setFilterOpen}
            title="Filter Members"
            trigger={
              <Button variant="outline" size="icon" className="shrink-0">
                <Filter className="h-4 w-4" />
              </Button>
            }
          >
            <div className="space-y-4">
              <p className="text-sm font-medium">Status</p>
              <div className="space-y-2">
                {(['all', 'active', 'inactive'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status)}
                    className={cn(
                      'w-full flex items-center justify-between p-3 rounded-xl transition-colors',
                      statusFilter === status
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted hover:bg-muted/80'
                    )}
                  >
                    <span className="capitalize font-medium">{status}</span>
                    {statusFilter === status && (
                      <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                    )}
                  </button>
                ))}
              </div>
              <Button
                variant="outline"
                className="w-full mt-4"
                onClick={() => {
                  setStatusFilter('all');
                  setFilterOpen(false);
                }}
              >
                Reset Filters
              </Button>
            </div>
          </BottomSheet>
        </div>

        {/* Results Count */}
        <p className="text-sm text-muted-foreground px-1">
          {filteredMembers.length} member{filteredMembers.length !== 1 ? 's' : ''}
        </p>

        {/* Mobile: Card List */}
        <StaggerContainer className="lg:hidden space-y-3">
          {filteredMembers.map((member) => {
            const memberTxs = activeTransactions.filter((t) => t.memberId === member.id);
            const net = calculateMemberNet(
              memberTxs.map((t) => ({ ...t, memberId: t.memberId })),
              member.id
            );
            const totalDeposit = memberTxs.filter((t) => t.type === 'deposit').reduce((s, t) => s + t.amount, 0);
            const totalReturn = memberTxs.filter((t) => t.type === 'return').reduce((s, t) => s + t.amount, 0);
            const totalWithdrawal = memberTxs.filter((t) => t.type === 'withdrawal').reduce((s, t) => s + t.amount, 0);
            const receivable = Math.max(0, -net);

            return (
              <StaggerItem key={member.id}>
                <MemberCard
                  member={member}
                  net={net}
                  totalDeposit={totalDeposit}
                  totalReturn={totalReturn}
                  totalWithdrawal={totalWithdrawal}
                  receivable={receivable}
                  isExpanded={expandedMember === member.id}
                  onToggle={() => setExpandedMember(expandedMember === member.id ? null : member.id)}
                />
              </StaggerItem>
            );
          })}
        </StaggerContainer>

        {/* Desktop: Table */}
        <Card className="hidden lg:block">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Net Balance</TableHead>
                  <TableHead className="text-right">Deposited</TableHead>
                  <TableHead className="text-right">Returned</TableHead>
                  <TableHead className="text-right">Withdrawn</TableHead>
                  <TableHead className="text-right">Receivable</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMembers.map((member) => {
                  const memberTxs = activeTransactions.filter((t) => t.memberId === member.id);
                  const net = calculateMemberNet(
                    memberTxs.map((t) => ({ ...t, memberId: t.memberId })),
                    member.id
                  );
                  const totalDeposit = memberTxs.filter((t) => t.type === 'deposit').reduce((s, t) => s + t.amount, 0);
                  const totalReturn = memberTxs.filter((t) => t.type === 'return').reduce((s, t) => s + t.amount, 0);
                  const totalWithdrawal = memberTxs.filter((t) => t.type === 'withdrawal').reduce((s, t) => s + t.amount, 0);
                  const receivable = Math.max(0, -net);

                  return (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">{member.name}</TableCell>
                      <TableCell className={cn(
                        'text-right',
                        net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                      )}>
                        {formatINR(net)}
                      </TableCell>
                      <TableCell className="text-right">{formatINR(totalDeposit)}</TableCell>
                      <TableCell className="text-right">{formatINR(totalReturn)}</TableCell>
                      <TableCell className="text-right">{formatINR(totalWithdrawal)}</TableCell>
                      <TableCell className="text-right">{formatINR(receivable)}</TableCell>
                      <TableCell>
                        <Badge variant={member.active ? 'default' : 'secondary'}>
                          {member.active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Empty State */}
        {filteredMembers.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No members found</p>
            <Button
              variant="link"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
              }}
            >
              Clear filters
            </Button>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
