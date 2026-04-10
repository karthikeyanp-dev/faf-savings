
import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatINR, getCurrentFY, calculateMemberNet } from '@/utils/financialYear';
import type { MemberDoc, TransactionDoc, StatsCurrent } from '@/types';
import { TrendingUp, TrendingDown, Wallet, IndianRupee, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { StaggerContainer, StaggerItem, TapScale } from '@/components/animations/PageTransition';
import { cn } from '@/lib/utils';

// Stat Card Component - Mobile optimized
function StatCard({
  title,
  value,
  icon: Icon,
  description,
  color,
  onClick,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  description?: string;
  color?: string;
  onClick?: () => void;
}) {
  const content = (
    <Card className={cn('h-full', onClick && 'cursor-pointer active:scale-[0.98] transition-transform')}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className={cn('p-2 rounded-xl', color || 'bg-primary/10')}>
            <Icon className={cn('h-5 w-5', color ? 'text-white' : 'text-primary')} />
          </div>
        </div>
        <div className="mt-3">
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-sm font-medium text-muted-foreground mt-0.5">{title}</p>
          {description && (
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (onClick) {
    return (
      <TapScale scale={0.98}>
        <div onClick={onClick}>{content}</div>
      </TapScale>
    );
  }

  return content;
}

// Mobile Member Card
function MemberCard({
  member,
  net,
  receivable,
  fyDeposited,
  onClick,
}: {
  member: MemberDoc;
  net: number;
  receivable: number;
  fyDeposited: number;
  onClick?: () => void;
}) {
  return (
    <TapScale scale={0.98} onClick={onClick}>
      <Card className="cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold',
                member.active ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
              )}>
                {member.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="font-semibold">{member.name}</p>
                <Badge variant={member.active ? 'default' : 'secondary'} className="text-[10px]">
                  {member.active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>
          
          <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-border">
            <div>
              <p className={cn(
                'text-lg font-bold',
                net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              )}>
                {formatINR(net)}
              </p>
              <p className="text-xs text-muted-foreground">Net</p>
            </div>
            <div>
              <p className="text-lg font-bold">{formatINR(receivable)}</p>
              <p className="text-xs text-muted-foreground">Receivable</p>
            </div>
            <div>
              <p className="text-lg font-bold">{formatINR(fyDeposited)}</p>
              <p className="text-xs text-muted-foreground">FY Deposit</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </TapScale>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const currentFY = getCurrentFY();

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'stats', 'current'));
      return snap.data() as StatsCurrent;
    },
  });

  const { data: members = [], isLoading: membersLoading } = useQuery({
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

  if (statsLoading || membersLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AppLayout>
    );
  }

  const activeTransactions = transactions.filter((t) => t.status === 'active');
  const fyTransactions = activeTransactions.filter((t) => t.fy === currentFY);

  const totalReceivables = members.reduce((sum, member) => {
    const net = calculateMemberNet(
      activeTransactions.map((t) => ({ ...t, memberId: t.memberId })),
      member.id
    );
    return sum + Math.max(0, -net);
  }, 0);

  const fyDeposited = fyTransactions
    .filter((t) => t.type === 'deposit')
    .reduce((sum, t) => sum + t.amount, 0);
  const fyReturned = fyTransactions
    .filter((t) => t.type === 'return')
    .reduce((sum, t) => sum + t.amount, 0);
  const fyWithdrawn = fyTransactions
    .filter((t) => t.type === 'withdrawal')
    .reduce((sum, t) => sum + t.amount, 0);

  const otherStatCards = [
    {
      title: 'Total Deposited',
      value: formatINR(stats?.totalDeposit || 0),
      icon: TrendingUp,
      description: 'Lifetime',
      color: 'bg-green-500',
    },
    {
      title: 'Total Returned',
      value: formatINR(stats?.totalReturn || 0),
      icon: TrendingUp,
      description: 'Lifetime',
      color: 'bg-emerald-500',
    },
    {
      title: 'Total Withdrawn',
      value: formatINR(stats?.totalWithdrawal || 0),
      icon: TrendingDown,
      description: 'Lifetime',
      color: 'bg-orange-500',
    },
    {
      title: 'Receivables',
      value: formatINR(totalReceivables),
      icon: IndianRupee,
      description: 'Members owe',
      color: 'bg-red-500',
    },
    {
      title: `FY ${currentFY}`,
      value: formatINR(fyDeposited + fyReturned - fyWithdrawn),
      icon: Wallet,
      description: `D: ${formatINR(fyDeposited)}`,
      color: 'bg-purple-500',
    },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Pool Balance Banner - Full Width */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="lg:hidden"
        >
          <Card className="bg-gradient-to-r from-blue-600 to-blue-500 border-0 shadow-lg">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white/80 text-sm font-medium">Total Pool Balance</p>
                  <p className="text-3xl font-bold mt-1 text-white">{formatINR(stats?.poolBalance || 0)}</p>
                  <p className="text-white/70 text-xs mt-1">Available for withdrawal</p>
                </div>
                <div className="p-3 bg-white/20 rounded-xl">
                  <Wallet className="h-8 w-8 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Stats Section */}
        <section>
          <h2 className="text-lg font-semibold mb-3 px-1">Overview</h2>
          
          {/* Mobile: Horizontal scroll of other stats (excluding pool balance) */}
          <div className="lg:hidden -mx-4 px-4">
            <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x pb-2">
              {otherStatCards.map((stat, index) => (
                <motion.div
                  key={stat.title}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="snap-start shrink-0 w-[160px]"
                >
                  <StatCard {...stat} />
                </motion.div>
              ))}
            </div>
          </div>

          {/* Desktop: Grid with all stats including pool balance */}
          <div className="hidden lg:grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <StatCard 
              title="Pool Balance"
              value={formatINR(stats?.poolBalance || 0)}
              icon={Wallet}
              description="Available"
              color="bg-blue-500"
            />
            {otherStatCards.map((stat) => (
              <StatCard key={stat.title} {...stat} />
            ))}
          </div>
        </section>

        {/* Members Section */}
        <section>
          <div className="flex items-center justify-between mb-3 px-1">
            <h2 className="text-lg font-semibold">Members</h2>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => navigate('/members')}
              className="text-sm text-primary font-medium"
            >
              View All
            </motion.button>
          </div>

          {/* Mobile: Card List */}
          <StaggerContainer className="lg:hidden space-y-3">
            {members.slice(0, 5).map((member) => {
              const net = calculateMemberNet(
                activeTransactions.map((t) => ({ ...t, memberId: t.memberId })),
                member.id
              );
              const receivable = Math.max(0, -net);
              const fyDepositedForMember = fyTransactions
                .filter((t) => t.memberId === member.id && t.type === 'deposit')
                .reduce((sum, t) => sum + t.amount, 0);

              return (
                <StaggerItem key={member.id}>
                  <MemberCard
                    member={member}
                    net={net}
                    receivable={receivable}
                    fyDeposited={fyDepositedForMember}
                    onClick={() => navigate('/members')}
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
                    <TableHead>Member</TableHead>
                    <TableHead className="text-right">Net Balance</TableHead>
                    <TableHead className="text-right">Receivable</TableHead>
                    <TableHead className="text-right">FY Deposited</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => {
                    const net = calculateMemberNet(
                      activeTransactions.map((t) => ({ ...t, memberId: t.memberId })),
                      member.id
                    );
                    const receivable = Math.max(0, -net);
                    const fyDepositedForMember = fyTransactions
                      .filter((t) => t.memberId === member.id && t.type === 'deposit')
                      .reduce((sum, t) => sum + t.amount, 0);

                    return (
                      <TableRow key={member.id}>
                        <TableCell className="font-medium">{member.name}</TableCell>
                        <TableCell
                          className={cn(
                            'text-right',
                            net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                          )}
                        >
                          {formatINR(net)}
                        </TableCell>
                        <TableCell className="text-right">{formatINR(receivable)}</TableCell>
                        <TableCell className="text-right">{formatINR(fyDepositedForMember)}</TableCell>
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
        </section>
      </div>
    </AppLayout>
  );
}
