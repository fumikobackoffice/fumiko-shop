'use client';

import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  Bar, 
  BarChart, 
  ResponsiveContainer, 
  XAxis, 
  YAxis, 
  Cell, 
  PieChart, 
  Pie, 
  Tooltip as RechartsTooltip,
  Legend
} from 'recharts';
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { Map as LucideMap, MapPin, Globe, LayoutGrid, PieChart as PieChartIcon, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Helper to map province to region
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
  province: string;
  lifetimeValue: number;
}

export function BranchDistributionSummary({ insights }: { insights: BranchInsight[] }) {
  const stats = useMemo(() => {
    // CRITICAL: Using globalThis.Map to prevent conflict with Lucide Map icon shadowing
    const provinceMap = new globalThis.Map<string, { count: number; revenue: number }>();
    const regionMap = new globalThis.Map<string, number>();

    insights.forEach((item) => {
      const province = item.province || 'ไม่ระบุ';
      
      // Province Stats
      const pData = provinceMap.get(province) || { count: 0, revenue: 0 };
      provinceMap.set(province, {
        count: pData.count + 1,
        revenue: pData.revenue + (item.lifetimeValue || 0)
      });

      // Region Stats
      const region = getRegion(province);
      regionMap.set(region, (regionMap.get(region) || 0) + 1);
    });

    const provinceArray = Array.from(provinceMap.entries())
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count);

    const regionArray = Array.from(regionMap.entries())
      .map(([name, count]) => ({ 
        name, 
        count,
        fill: name === 'ภาคกลาง' ? 'hsl(var(--primary))' : 
              name === 'ภาคเหนือ' ? 'hsl(var(--chart-2))' :
              name === 'ภาคอีสาน' ? 'hsl(var(--chart-3))' :
              name === 'ภาคใต้' ? 'hsl(var(--chart-4))' : 'hsl(var(--chart-5))'
      }))
      .sort((a, b) => b.count - a.count);

    const topProvince = provinceArray[0] || { name: '-', count: 0 };
    const topRegion = regionArray[0] || { name: '-', count: 0 };
    const coverageCount = provinceMap.size;

    return { provinceArray, regionArray, topProvince, topRegion, coverageCount };
  }, [insights]);

  const chartConfig = {
    count: { label: 'จำนวนสาขา', color: 'hsl(var(--primary))' },
  } satisfies ChartConfig;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-primary/5 border-primary/20 shadow-sm overflow-hidden relative">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" /> Coverage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{stats.coverageCount} / 77</div>
            <p className="text-[10px] text-muted-foreground mt-1 font-medium">จังหวัดที่เราดำเนินกิจการอยู่</p>
          </CardContent>
          <LucideMap className="absolute -right-4 -bottom-4 h-24 w-24 text-primary/5 rotate-12" />
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" /> Top Province
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.topProvince.name}</div>
            <p className="text-[10px] text-muted-foreground mt-1 font-medium">หนาแน่นที่สุดด้วยจำนวน {stats.topProvince.count} สาขา</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <LayoutGrid className="h-4 w-4 text-primary" /> Top Region
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.topRegion.name}</div>
            <p className="text-[10px] text-muted-foreground mt-1 font-medium">
              สัดส่วนประมาณ {insights.length > 0 ? Math.round((stats.topRegion.count / insights.length) * 100) : 0}% ของสาขาทั้งหมด
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-3 shadow-md">
          <CardHeader className="pb-0">
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Province Ranking
            </CardTitle>
            <CardDescription>จัดอันดับจังหวัดที่มีจำนวนสาขามากที่สุด 10 อันดับแรก</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <ChartContainer config={chartConfig} className="h-[350px] w-full">
              <BarChart
                data={stats.provinceArray.slice(0, 10)}
                layout="vertical"
                margin={{ left: 20, right: 40 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  dataKey="name"
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  width={100}
                  className="text-xs font-bold"
                />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar 
                  dataKey="count" 
                  radius={[0, 4, 4, 0]} 
                  barSize={24}
                >
                  {stats.provinceArray.slice(0, 10).map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={`hsl(var(--primary) / ${1 - (index * 0.08)})`} 
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 shadow-md">
          <CardHeader className="pb-0">
            <CardTitle className="text-lg flex items-center gap-2">
              <PieChartIcon className="h-5 w-5 text-primary" />
              Regional Breakdown
            </CardTitle>
            <CardDescription>สัดส่วนการกระจายตัวของสาขาแยกตามภูมิภาค</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center pt-6">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.regionArray}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                  >
                    {stats.regionArray.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                  />
                  <Legend 
                    verticalAlign="bottom" 
                    height={36} 
                    iconType="circle"
                    formatter={(value) => <span className="text-xs font-medium text-muted-foreground">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="text-center mt-2">
              <p className="text-xs text-muted-foreground font-medium">รวมทั้งหมด {insights.length} สาขา</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}