#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
经验曲线生成器（v12 · 27 个实测锚点，接近定稿）

实测锚点（游戏内截图，全部精确）:
    L1–L16 : 100 200 300 400 600 900 1200 1700 2500 6000 8000 10000 15000 30000 40000 50000
    L38    : 8,200,000         L39 : 9,000,000
    L65    : 1,400,000,000
    L72    : 2,800,000,000     L73 : 3,000,000,000   L74 : 3,200,000,000
    L86    : 6,300,000,000     L91 : 8,800,000,000
    L95    : 12,800,000,000    L97 : 14,800,000,000
    L110   : 27,800,000,000

六段结构:
    L1–L16   实测手配，逐项照抄（全是 100 的整数倍）
    L17–L37  二次对数插值  lnE = 3.443707 + 0.557507·L − 0.006031·L²
             锚 (16,50000) (38,8.2e6) (39,9e6)
    L38–L39  实测
    L40–L64  对数线性  r = (E65/E39)^(1/26) = 1.21424
    L65–L71  对数线性  r = 1.10409
    L72–L74  实测
    L74–L85  对数线性  r = 1.05807
    L86–L90  对数线性  r = 1.06912
    L91–L94  对数线性  r = 1.09820
    L95–L96  对数线性  r = 1.07529
    L97–L109 对数线性  r = 1.04969
    L110–125 外推  r = 1 + 0.04969·e^(−(L−110)/18.0)
             tau 由 r(L96)=0.07529 与 r(L103.5)=0.04969 反推

⚠️ L73 截图为 30,000,000,000，但 L74=3,200,000,000 更小 → 违反单调。
   用 L72/L74 夹逼得 2,993,325,909 → 判定截图多写一个 0，取 3,000,000,000。

★ float32 尾数假设【已证实】:
    float32(6,300,000,000)  = 6,300,000,256   ← 与截图一致
    float32(27,800,000,000) = 27,800,000,512  ← 与截图一致
    → 真值是整数。**移植必须用 int64 存经验，别用 float。**

用法:
    python3 exp_curve_gen.py
    python3 exp_curve_gen.py --tau 12          # 末端衰减更快
    python3 exp_curve_gen.py --maxlevel 120
"""
import argparse, math, os

MEASURED = {1:100,2:200,3:300,4:400,5:600,6:900,7:1200,8:1700,9:2500,10:6000,
            11:8000,12:10000,13:15000,14:30000,15:40000,16:50000,
            38:8_200_000,39:9_000_000,
            65:1_400_000_000,72:2_800_000_000,73:3_000_000_000,74:3_200_000_000,
            86:6_300_000_000,91:8_800_000_000,95:12_800_000_000,97:14_800_000_000,
            110:27_800_000_000}
SEGS = [(39,65),(65,72),(72,74),(74,86),(86,91),(91,95),(95,97),(97,110)]

def qsolve(pts):
    Mat=[[1.0,float(L),float(L*L)] for L,V in pts]; y=[math.log(V) for L,V in pts]
    n=3
    for i in range(n):
        p=max(range(i,n),key=lambda r:abs(Mat[r][i])); Mat[i],Mat[p]=Mat[p],Mat[i]; y[i],y[p]=y[p],y[i]
        for r in range(i+1,n):
            f=Mat[r][i]/Mat[i][i]
            for c in range(i,n): Mat[r][c]-=f*Mat[i][c]
            y[r]-=f*y[i]
    x=[0.0]*n
    for i in reversed(range(n)):
        x[i]=(y[i]-sum(Mat[i][c]*x[c] for c in range(i+1,n)))/Mat[i][i]
    return x

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--tau',type=float,default=18.0,help='末端增长率衰减常数(实测反推)')
    ap.add_argument('--maxlevel',type=int,default=125)
    ap.add_argument('--out',default=os.path.join(os.path.dirname(os.path.abspath(__file__)),'exp_curve.tsv'))
    a=ap.parse_args()

    p0,p1,p2=qsolve([(16,50000),(38,8_200_000),(39,9_000_000)])
    Q=lambda L: math.exp(p0+p1*L+p2*L*L)

    E={}
    for L in range(1,a.maxlevel+1):
        if L in MEASURED: E[L]=MEASURED[L]
        elif L<38: E[L]=max(1,round(Q(L)))
    for lo,hi in SEGS:
        if lo>a.maxlevel: continue
        if hi>a.maxlevel: hi=max(k for k in MEASURED if k>lo)
        r=(MEASURED[hi]/MEASURED[lo])**(1/(hi-lo))
        for L in range(lo+1,hi):
            if L not in MEASURED: E[L]=round(MEASURED[lo]*(r**(L-lo)))
    if a.maxlevel>110:
        r110=(MEASURED[110]/MEASURED[97])**(1/13)-1
        for L in range(110,a.maxlevel):
            r=1+r110*math.exp(-(L-110)/a.tau)
            E[L+1]=max(E[L]+1,round(E[L]*r))

    if not all(E[i]>=E[i-1] for i in range(2,a.maxlevel+1)):
        raise SystemExit('[FAIL] 非单调递增')

    with open(a.out,'w',encoding='utf-8') as f:
        f.write(f"# L1-L16 实测手配 ; L17-L37 二次对数插值 lnE={p0:.6f}{p1:+.6f}L{p2:+.6f}L^2\n")
        f.write("# L38-L39 实测 ; L40-L109 分段对数线性插值 ; L110+ 衰减外推\n")
        f.write("# 锚点: "+", ".join(f"E({L})={V:,}" for L,V in sorted(MEASURED.items()))+"\n")
        f.write("# ⚠️ L73 截图 30,000,000,000 违反单调(L74=3.2e9)，已按 3,000,000,000 处理\n")
        f.write("# ★ 经验值用 int64 存储，勿用 float（float32 尾数已两次证实）\n")
        f.write("# 口径: exp_to_next=升到【下一级】所需 ; cum_total=从1级累计到本级前\n")
        f.write("level\texp_to_next\tcum_total\tsource\n")
        tot=0
        for L in range(1,a.maxlevel+1):
            s='measured' if L in MEASURED else ('interpA' if L<38 else ('interpB' if L<110 else 'extrap'))
            f.write(f"{L}\t{E[L]}\t{tot}\t{s}\n"); tot+=E[L]

    print(f'写出 {a.out}')
    print(f'锚点数 {len(MEASURED)}  覆盖率 {len(MEASURED)/a.maxlevel*100:.0f}%')
    print('校核: '+'  '.join(f'E({L})={E[L]:,}' for L in (1,16,39,65,74,86,95,110)))
    print()
    print('%-6s %-20s %-10s %s'%('L','exp_to_next','每级+%','来源'))
    for L in (1,10,16,20,38,39,40,65,72,74,86,91,95,97,110,115,125):
        if L<=a.maxlevel:
            s='实测' if L in MEASURED else ('插值A' if L<38 else ('插值B' if L<110 else '外推'))
            print('%-6d %-20s %-10s %s'%(L,f'{E[L]:,}','—' if L==1 else f'+{(E[L]/E[L-1]-1)*100:.2f}%',s))

if __name__=='__main__':
    main()
