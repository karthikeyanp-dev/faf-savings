import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/providers/AuthProvider';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatINR, getCurrentFY } from '@/utils/financialYear';
import type { TransactionDoc, MemberDoc } from '@/types';
import { EditTransactionDialog } from '@/components/transactions/EditTransactionDialog';
import { VoidTransactionDialog } from '@/components/transactions/VoidTransactionDialog';
import { Search, Filter, X, ArrowUpRight, ArrowDownRight, RotateCcw, Wallet, Calendar, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';
import { StaggerContainer, StaggerItem } from '@/components/animations/PageTransition';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

// Transaction type config
const txTypeConfig = {
  deposit: { 
    label: 'Deposit', 
    color: 'bg-green-500', 
    icon: ArrowUpRight,
    badge: 'default' as const
  },
  withdrawal: { 
    label: 'Withdrawal', 
    color: 'bg-orange-500', 
    icon: ArrowDownRight,
    badge: 'destructive' as const
  },
  return: { 
    label: 'Return', 
    color: 'bg-blue-500', 
    icon: RotateCcw,
    badge: 'secondary' as const
  },
  opening_balance: { 
    label: 'Opening', 
    color: 'bg-purple-500', 
    icon: Wallet,
    badge: 'outline' as const
  },
  interest: { 
    label: 'Interest', 
    color: 'bg-amber-500', 
    icon: TrendingUp,
    badge: 'secondary' as const
  },
};

// Mobile Transaction Card
function TransactionCard({
  tx,
  memberName,
  onEdit,
  onVoid,
  isMaintainer,
}: {
  tx: TransactionDoc;
  memberName: string;
  onEdit: () => void;
  onVoid: () => void;
  isMaintainer: boolean;
}) {
  const config = txTypeConfig[tx.type] || txTypeConfig.deposit;
  const Icon = config.icon;
  const isActive = tx.status === 'active';

  return (
    <Card className={cn(!isActive && 'opacity-60')}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={cn('p-2 rounded-xl', config.color)}>
              <Icon className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="font-semibold">{config.label}</p>
              <p className="text-sm text-muted-foreground">{memberName}</p>
            </div>
          </div>
          <div className="text-right">
            <p className={cn(
              'font-bold text-lg',
              tx.type === 'withdrawal' ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'
            )}>
              {tx.type === 'withdrawal' ? '-' : '+'}{formatINR(tx.amount)}
            </p>
            <Badge variant={isActive ? 'default' : 'secondary'} className="text-[10px]">
              {tx.status}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            <span>{format(tx.date.toDate(), 'MMM d, yyyy')}</span>
          </div>
          {tx.savingsMonth && (
            <span className="text-xs bg-muted px-2 py-0.5 rounded-full">
              {tx.savingsMonth}
            </span>
          )}
        </div>

        {tx.notes && (
          <p className="text-sm text-muted-foreground mt-2">{tx.notes}</p>
        )}

        {isMaintainer && isActive && (
          <div className="flex gap-2 mt-3">
            <Button variant="outline" size="sm" className="flex-1" onClick={onEdit}>
              Edit
            </Button>
            <Button variant="destructive" size="sm" className="flex-1" onClick={onVoid}>
              Void
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Filter Chip
function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      className={cn(
        'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
        active
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-muted-foreground hover:bg-muted/80'
      )}
    >
      {label}
    </motion.button>
  );
}

export function ActivityPage() {
  const { isMaintainer } = useAuth();
  const currentFY = getCurrentFY();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<TransactionDoc | null>(null);
  const [voidingTx, setVoidingTx] = useState<TransactionDoc | null>(null);

  // Filters
  const [fyFilter, setFyFilter] = useState<string>(currentFY);
  const [memberFilter, setMemberFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const { data: transactions = [] } = useQuery({
    queryKey: ['transactions'],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'transactions'));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TransactionDoc));
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ['members'],
    queryFn: async () => {
      const snap = await getDocs(collection(db, 'members'));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as MemberDoc));
    },
  });

  const visibleTransactions = useMemo(
    () => transactions.filter((t) => t.type !== 'opening_balance'),
    [transactions]
  );

  const fys = useMemo(() => 
    Array.from(new Set(visibleTransactions.map((t) => t.fy))).sort().reverse(),
    [visibleTransactions]
  );

  const filtered = useMemo(() => {
    return visibleTransactions
      .filter((t) => fyFilter === 'all' || t.fy === fyFilter)
      .filter((t) => memberFilter === 'all' || t.memberId === memberFilter)
      .filter((t) => typeFilter === 'all' || t.type === typeFilter)
      .filter((t) => {
        if (!searchQuery) return true;
        const memberName = members.find((m) => m.id === t.memberId)?.name || '';
        const searchLower = searchQuery.toLowerCase();
        return (
          memberName.toLowerCase().includes(searchLower) ||
          (t.notes && t.notes.toLowerCase().includes(searchLower)) ||
          t.type.toLowerCase().includes(searchLower)
        );
      })
      .sort((a, b) => b.date.toMillis() - a.date.toMillis());
  }, [visibleTransactions, fyFilter, memberFilter, typeFilter, searchQuery, members]);

  const getMemberName = (memberId: string) => {
    return members.find((m) => m.id === memberId)?.name || 'Unknown';
  };

  const activeFiltersCount = [
    fyFilter !== 'all',
    memberFilter !== 'all',
    typeFilter !== 'all',
  ].filter(Boolean).length;

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Search Bar */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search transactions..."
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
            title="Filter Transactions"
            trigger={
              <Button variant="outline" size="icon" className="relative shrink-0">
                <Filter className="h-4 w-4" />
                {activeFiltersCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-primary-foreground text-[10px] rounded-full flex items-center justify-center font-bold">
                    {activeFiltersCount}
                  </span>
                )}
              </Button>
            }
          >
            <div className="space-y-6">
              {/* FY Filter */}
              <div>
                <p className="text-sm font-medium mb-3">Financial Year</p>
                <div className="flex flex-wrap gap-2">
                  <FilterChip
                    label="All"
                    active={fyFilter === 'all'}
                    onClick={() => setFyFilter('all')}
                  />
                  {fys.map((fy) => (
                    <FilterChip
                      key={fy}
                      label={`FY ${fy}`}
                      active={fyFilter === fy}
                      onClick={() => setFyFilter(fy)}
                    />
                  ))}
                </div>
              </div>

              {/* Type Filter */}
              <div>
                <p className="text-sm font-medium mb-3">Transaction Type</p>
                <div className="flex flex-wrap gap-2">
                  <FilterChip
                    label="All"
                    active={typeFilter === 'all'}
                    onClick={() => setTypeFilter('all')}
                  />
                  {Object.entries(txTypeConfig).map(([type, config]) => (
                    <FilterChip
                      key={type}
                      label={config.label}
                      active={typeFilter === type}
                      onClick={() => setTypeFilter(type)}
                    />
                  ))}
                </div>
              </div>

              {/* Member Filter */}
              <div>
                <p className="text-sm font-medium mb-3">Member</p>
                <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                  <FilterChip
                    label="All Members"
                    active={memberFilter === 'all'}
                    onClick={() => setMemberFilter('all')}
                  />
                  {members.map((m) => (
                    <FilterChip
                      key={m.id}
                      label={m.name}
                      active={memberFilter === m.id}
                      onClick={() => setMemberFilter(m.id)}
                    />
                  ))}
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setFyFilter('all');
                  setTypeFilter('all');
                  setMemberFilter('all');
                }}
              >
                Reset All Filters
              </Button>
            </div>
          </BottomSheet>
        </div>

        {/* Quick Filter Chips - Mobile */}
        <div className="lg:hidden -mx-4 px-4">
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            <FilterChip
              label="All FYs"
              active={fyFilter === 'all'}
              onClick={() => setFyFilter('all')}
            />
            <FilterChip
              label={`FY ${currentFY}`}
              active={fyFilter === currentFY}
              onClick={() => setFyFilter(currentFY)}
            />
            <FilterChip
              label="Deposits"
              active={typeFilter === 'deposit'}
              onClick={() => setTypeFilter(typeFilter === 'deposit' ? 'all' : 'deposit')}
            />
            <FilterChip
              label="Withdrawals"
              active={typeFilter === 'withdrawal'}
              onClick={() => setTypeFilter(typeFilter === 'withdrawal' ? 'all' : 'withdrawal')}
            />
          </div>
        </div>

        {/* Results Count */}
        <p className="text-sm text-muted-foreground px-1">
          {filtered.length} transaction{filtered.length !== 1 ? 's' : ''}
        </p>

        {/* Mobile: Card List */}
        <StaggerContainer className="lg:hidden space-y-3">
          {filtered.map((tx) => (
            <StaggerItem key={tx.id}>
              <TransactionCard
                tx={tx}
                memberName={getMemberName(tx.memberId)}
                onEdit={() => setEditingTx(tx)}
                onVoid={() => setVoidingTx(tx)}
                isMaintainer={isMaintainer}
              />
            </StaggerItem>
          ))}
        </StaggerContainer>

        {/* Desktop: Table */}
        <Card className="hidden lg:block">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Month</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Status</TableHead>
                  {isMaintainer && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>{tx.date.toDate().toLocaleDateString()}</TableCell>
                    <TableCell>{getMemberName(tx.memberId)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={txTypeConfig[tx.type]?.badge || 'default'}
                      >
                        {txTypeConfig[tx.type]?.label || tx.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatINR(tx.amount)}</TableCell>
                    <TableCell>{tx.savingsMonth || '-'}</TableCell>
                    <TableCell>{tx.notes || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={tx.status === 'active' ? 'default' : 'secondary'}>
                        {tx.status}
                      </Badge>
                    </TableCell>
                    {isMaintainer && tx.status === 'active' && (
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => setEditingTx(tx)}>
                            Edit
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => setVoidingTx(tx)}>
                            Void
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Empty State */}
        {filtered.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No transactions found</p>
            <Button
              variant="link"
              onClick={() => {
                setSearchQuery('');
                setFyFilter('all');
                setTypeFilter('all');
                setMemberFilter('all');
              }}
            >
              Clear filters
            </Button>
          </div>
        )}

        {/* Dialogs */}
        {editingTx && <EditTransactionDialog transaction={editingTx} open onClose={() => setEditingTx(null)} />}
        {voidingTx && <VoidTransactionDialog transaction={voidingTx} open onClose={() => setVoidingTx(null)} />}
      </div>
    </AppLayout>
  );
}
