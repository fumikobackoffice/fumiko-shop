'use client';

import React, { useMemo, useState, Fragment } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, MapPin, TrendingUp, ArrowUp, ArrowDown, ChevronsUpDown, ChevronRight, Store, User } from 'lucide-react';
import { cn } from '@/lib/utils';

// Helper same as summary for consistency
const getRegion = (province: string): string => {
  const central = ['กรุงเทพมหานคร', 'นนทบุรี', 'ปทุมธานี', 'พระนครศรีอยุธยา', 'อ่างทอง', 'ลพบุรี', 'ชัยนาท', 'สิงห์บุรี', 'สระบุรี', 'นครนายก', 'นครปฐม', 'สมุทรปราการ', 'สมุทรสาคร', 'สมุทรสงคราม', 'ราชบุรี', 'กาญจนบุรี', 'สุพรรณบุรี', 'เพชรบุรี', 'ประจวบคีรีขันธ์'];
  const north = ['เชียงใหม่', 'ลำพูน', 'ลำปาง', 'อุตรดิตถ์', 'แพร่', 'น่าน', 'พะเยา', 'เชียงราย', 'แม่ฮ่องสอน', 'สุโขทัย', 'พิษณุโลก', 'พิจิตร', 'กำแพงเพชร', 'นครสวรรค์', 'อุทัยธานี'];
  const northeast = ['นครราชสีมา', 'บุรีรัมย์', 'สุรินทร์', 'ศรีสะเกษ', 'อุบลราชธานี', 'ยโสธร', 'ชัยภูมิ', 'อำนาจเจริญ', 'หนองบัวลำภู', 'ขอนแก่น', 'อุดรธานี', 'เลย', 'หนองคาย', 'มหาสารคาม', 'ร้อยเอ็ด', 'กาฬสินธุ์', 'สกลนคร', 'นครพนม', 'มุกดาหาร', 'บึงกาฬ'];
  const south = ['นครศรีธรรมราช', 'กระบี่', 'พังงา', 'ภูเก็ต', 'สุราษฎร์ธานี', 'ระนอง', 'ชุมพร', 'สงขลา', 'สตูล', 'ตรัง', 'พัทลุง', 'ปัตตานี', 'ยะลา', 'นราธิวาส'];
  const east = ['ปราจีนบุรี', 'ฉะเชิงเทรา', 'ชลบุรี', 'ระยอง', 'จันทบุรี', 'ตราด', 'สระแก้ว'];

  if (central.includes(province)) return 'ภาคกลาง';
  if (north.includes(province)) return 'ภาคเหนือ';
  if (northeast.includes(province)) return 'ภาคอีสาน';
  if (south.includes(province)) return 'ภาคใต้';
  if (east.includes(province)) return 'ภาคตะวันออก';
  return 'อื่นๆ';
};

interface BranchInsight {
  branchId: string;
  branchName: string;
  branchCode: string;
  province: string;
  lifetimeValue: number;
  ownerName: string;
}

type SortConfig = {
  key: 'province' | 'region' | 'count' | 'percentage' | 'revenue';
  direction: 'asc' | 'desc';
};

export function BranchDistributionTable({ insights }: { insights: BranchInsight[] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'count', direction: 'desc' });
  const [expandedProvince, setExpandedProvince] = useState<string | null>(null);

  const distribution = useMemo(() => {
    // Using globalThis.Map for extra safety against potential name shadowing
    const map = new globalThis.Map<string, { count: number; revenue: number; branches: BranchInsight[] }>();
    let maxCount = 0;

    insights.forEach((item) => {
      const province = item.province || 'ไม่ระบุ';
      const data = map.get(province) || { count: 0, revenue: 0, branches: [] };
      const newCount = data.count + 1;
      map.set(province, {
        count: newCount,
        revenue: data.revenue + (item.lifetimeValue || 0),
        branches: [...data.branches, item]
      });
      if (newCount > maxCount) maxCount = newCount;
    });

    const total = insights.length || 1;

    let result = Array.from(map.entries())
      .map(([name, data]) => ({
        province: name,
        region: getRegion(name),
        count: data.count,
        revenue: data.revenue,
        branches: data.branches,
        percentage: (data.count / total) * 100,
        density: (data.count / maxCount) * 100
      }));

    // Sorting Logic
    result.sort((a, b) => {
      const { key, direction } = sortConfig;
      let comparison = 0;
      
      if (key === 'province' || key === 'region') {
        comparison = (a[key] || '').localeCompare(b[key] || '', 'th');
      } else {
        comparison = (a[key] as number) - (b[key] as number);
      }
      
      return direction === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [insights, sortConfig]);

  const filteredData = distribution.filter(d => 
    (d.province || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (d.region || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSort = (key: SortConfig['key']) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const toggleProvince = (province: string) => {
    setExpandedProvince(prev => prev === province ? null : province);
  };

  const SortIcon = ({ column }: { column: SortConfig['key'] }) => {
    if (sortConfig.key !== column) return <ChevronsUpDown className="ml-2 h-3.5 w-3.5 opacity-30" />;
    return sortConfig.direction === 'asc' ? <ArrowUp className="ml-2 h-3.5 w-3.5 text-primary" /> : <ArrowDown className="ml-2 h-3.5 w-3.5 text-primary" />;
  };

  return (
    <Card className="shadow-sm border-none bg-background/50">
      <CardHeader className="px-0 pb-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <CardTitle className="text-xl flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Market Density Table
            </CardTitle>
            <CardDescription>รายละเอียดสัดส่วนสาขาและรายชื่อสาขาแยกรายจังหวัด (คลิกที่แถวเพื่อดูรายชื่อสาขา)</CardDescription>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="ค้นหาจังหวัดหรือภาค..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-white dark:bg-muted/20 rounded-full"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <div className="rounded-xl border bg-white dark:bg-card overflow-hidden shadow-sm">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="font-bold">
                  <button onClick={() => handleSort('province')} className="flex items-center hover:text-primary transition-colors">
                    จังหวัด <SortIcon column="province" />
                  </button>
                </TableHead>
                <TableHead className="font-bold">
                  <button onClick={() => handleSort('region')} className="flex items-center hover:text-primary transition-colors">
                    ภูมิภาค <SortIcon column="region" />
                  </button>
                </TableHead>
                <TableHead className="text-right font-bold w-[200px]">
                  <button onClick={() => handleSort('count')} className="flex items-center justify-end w-full hover:text-primary transition-colors">
                    ความหนาแน่น (สาขา) <SortIcon column="count" />
                  </button>
                </TableHead>
                <TableHead className="text-right font-bold">
                  <button onClick={() => handleSort('percentage')} className="flex items-center justify-end w-full hover:text-primary transition-colors">
                    สัดส่วน (%) <SortIcon column="percentage" />
                  </button>
                </TableHead>
                <TableHead className="text-right font-bold">
                  <button onClick={() => handleSort('revenue')} className="flex items-center justify-end w-full hover:text-primary transition-colors">
                    ยอดซื้อสะสม <SortIcon column="revenue" />
                  </button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">ไม่พบข้อมูลการกระจายตัว</TableCell>
                </TableRow>
              ) : (
                filteredData.map((row) => (
                  <Fragment key={row.province}>
                    <TableRow 
                      className={cn(
                        "hover:bg-muted/20 transition-colors cursor-pointer group",
                        expandedProvince === row.province && "bg-primary/5 hover:bg-primary/10"
                      )}
                      onClick={() => toggleProvince(row.province)}
                    >
                      <TableCell className="font-bold">
                        <div className="flex items-center gap-2">
                          <ChevronRight className={cn(
                            "h-4 w-4 text-muted-foreground transition-transform duration-200",
                            expandedProvince === row.province && "rotate-90 text-primary"
                          )} />
                          {row.province}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-medium opacity-70 bg-background/50">
                          {row.region}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col gap-1.5 items-end">
                          <div className="flex items-center gap-2 text-sm font-bold">
                            {row.count} <span className="text-[10px] font-normal text-muted-foreground">สาขา</span>
                          </div>
                          <Progress value={row.density} className="h-1 w-full bg-muted" />
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold">
                        {row.percentage.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5 text-primary font-bold">
                          <TrendingUp className="h-3 w-3 opacity-50" />
                          ฿{row.revenue.toLocaleString()}
                        </div>
                      </TableCell>
                    </TableRow>
                    
                    {/* Expanded List of Branches */}
                    {expandedProvince === row.province && (
                      <TableRow className="bg-muted/10 hover:bg-muted/10 border-b-2 border-primary/10">
                        <TableCell colSpan={5} className="p-0">
                          <div className="px-12 py-4 animate-in slide-in-from-top-2 duration-300">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {row.branches.map((branch) => (
                                <div 
                                  key={branch.branchId}
                                  className="flex items-start gap-3 p-3 rounded-lg border bg-white dark:bg-muted/20 shadow-sm hover:border-primary/50 transition-colors"
                                >
                                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                    <Store className="h-4 w-4 text-primary" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-sm font-bold truncate leading-tight">{branch.branchName}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                      <Badge variant="secondary" className="text-[9px] font-mono h-4 px-1.5">{branch.branchCode}</Badge>
                                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                        <User className="h-3 w-3" />
                                        {branch.ownerName}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}