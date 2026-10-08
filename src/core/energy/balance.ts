/** Wynik bilansu energii za okres (kWh i zl). */
export interface Balance {
  pv: number;
  house: number;
  imp: number;
  exp: number;
  bin: number;
  bout: number;
  loss: number;
  pvHouse: number;
  batHouse: number;
  batHousePv: number; // energia z PV, ktora przeszla przez magazyn do domu
  gridHouse: number;
  gridBat: number;
  pvBat: number;
  pvGrid: number;
  batGrid: number;
  /** zawartosc magazynu na koniec okresu: udzialy pochodzenia (suma 1) */
  tankPv: number;
  tankGrid: number;
  tankUnknown: number;
  /** sredni koszt energii w magazynie na koniec (zl/kWh); NaN - nieznany */
  tankAvgCost: number;
  socKnown: boolean;
  coverage: number; // pokrycie domu wlasna produkcja (0..1)
  haSelfSuff: number; // jak w HA: 1 - import / zuzycie z bilansu
  // pieniadze (zl)
  impCost: number;
  impEc: number;
  impDist: number;
  expRev: number;
  houseGridCost: number;
  /** PV w domu: (taryfa - cena sprzedazy) x kWh - zysk ponad sprzedaz */
  pvSelfGain: number;
  /** magazyn: wartosc pobran (dom - taryfa, siec - cena sprzedazy) minus koszt pobranej energii */
  batValueHouse: number;
  batValueGrid: number;
  batCostOut: number;
  costKnown: boolean;
  hours: Array<{ t: number; imp: number; exp: number; price?: number; pv: number; house: number }>;
}

export interface HourIn {
  t: number;
  pv: number;
  imp: number;
  exp: number;
  bin: number;
  bout: number;
  house?: number; // licznik domu; brak - z bilansu
  /** SoC magazynu (%) - zawartosc rzeczywista = SoC x pojemnosc */
  soc?: number;
  /** ceny w zl/kWh (juz z mnoznikami); undefined = nieznana */
  ec?: number;
  dist?: number;
  rce?: number;
  /** koszt / rekompensata z panelu Energia (gdy brak cen) */
  haCost?: number;
  haComp?: number;
}

/**
 * Bilans godzina po godzinie. Przeplywy: PV -> dom, PV -> magazyn, PV -> siec; magazyn -> dom, magazyn -> siec;
 * siec -> dom, siec -> magazyn.
 *
 * Magazyn jako zbiornik z cena nabycia (jak srednia cena paliwa w baku): dolanie z sieci po cenie zakupu,
 * dolanie z PV po cenie utraconej sprzedazy; pobranie do domu warte cene zakupu, na sprzedaz - cene sprzedazy.
 * Co godzine zbiornik dopasowany do rzeczywistej zawartosci (SoC x pojemnosc): straty zmniejszaja energie,
 * a koszt zostaje (sredni koszt rosnie); nadwyzka zawartosci o nieznanym pochodzeniu - "nieznane".
 * `warm` godzin rozbiegu przed okresem ustawia stan zbiornika.
 */
export function computeBalance(hours: HourIn[], warm: number, capacity?: number): Balance {
  const b: Balance = {
    pv: 0, house: 0, imp: 0, exp: 0, bin: 0, bout: 0, loss: 0,
    pvHouse: 0, batHouse: 0, batHousePv: 0, gridHouse: 0, gridBat: 0, pvBat: 0, pvGrid: 0, batGrid: 0,
    tankPv: 0, tankGrid: 0, tankUnknown: 1, tankAvgCost: NaN, socKnown: false, coverage: 0, haSelfSuff: 0,
    impCost: 0, impEc: 0, impDist: 0, expRev: 0, houseGridCost: 0, pvSelfGain: 0,
    batValueHouse: 0, batValueGrid: 0, batCostOut: 0, costKnown: false, hours: [],
  };
  // zbiornik: energia wg pochodzenia + laczny koszt nabycia
  let ePv = 0;
  let eGrid = 0;
  let eUnk = 0;
  let cost = 0;
  let costOk = true;
  hours.forEach((h, i) => {
    const counted = i >= warm;
    // ceny tej godziny: zakup (taryfa) i sprzedaz
    const pBuy =
      h.ec !== undefined || h.dist !== undefined ? (h.ec ?? 0) + (h.dist ?? 0) : h.haCost !== undefined && h.imp > 0 ? h.haCost / h.imp : undefined;
    const pSell = h.rce !== undefined ? h.rce : h.haComp !== undefined && h.exp > 0 ? Math.abs(h.haComp) / h.exp : undefined;
    const balHouse = h.imp + h.pv + h.bout - h.exp - h.bin;
    const house = Math.max(0, h.house ?? balHouse);
    // 2. przeplywy
    const pvHouse = Math.min(h.pv, house);
    let pvLeft = h.pv - pvHouse;
    const pvBat = Math.min(pvLeft, h.bin);
    pvLeft -= pvBat;
    const pvGrid = Math.min(pvLeft, h.exp);
    const gridBat = Math.max(0, h.bin - pvBat);
    const batHouse = Math.min(h.bout, house - pvHouse);
    const batGrid = Math.max(0, Math.min(h.bout - batHouse, h.exp - pvGrid));
    const gridHouse = Math.max(0, house - pvHouse - batHouse);
    // 3. pobranie ze zbiornika (proporcjonalnie) z kosztem nabycia
    const tot = ePv + eGrid + eUnk;
    const sPv = tot > 0.001 ? ePv / tot : 0;
    const avg = tot > 0.001 ? cost / tot : pSell ?? 0;
    const take = Math.min(h.bout, tot);
    if (tot > 0.001) {
      const k = (tot - take) / tot;
      ePv *= k;
      eGrid *= k;
      eUnk *= k;
      cost *= k;
    }
    // 4. dolanie z kosztem
    ePv += pvBat;
    eGrid += gridBat;
    if (pvBat > 0) {
      if (pSell !== undefined) cost += pvBat * pSell;
      else costOk = false;
    }
    if (gridBat > 0) {
      if (pBuy !== undefined) cost += gridBat * pBuy;
      else costOk = false;
    }
    // 5. dopasowanie do rzeczywistej zawartosci (SoC z tej godziny = stan po jej przeplywach)
    if (h.soc !== undefined && capacity) {
      b.socKnown = true;
      const real = Math.max(0, (h.soc / 100) * capacity);
      const tot = ePv + eGrid + eUnk;
      if (tot > real && tot > 0) {
        const k = real / tot; // straty / roznice: energia mniej, koszt zostaje
        ePv *= k;
        eGrid *= k;
        eUnk *= k;
      } else if (real > tot) {
        eUnk += real - tot; // zawartosc o nieznanym pochodzeniu
        if (pSell !== undefined) cost += (real - tot) * pSell;
        else costOk = false;
      }
    }
    if (!counted) return;
    b.pv += h.pv; b.house += house; b.imp += h.imp; b.exp += h.exp; b.bin += h.bin; b.bout += h.bout;
    b.loss += Math.max(0, balHouse - house);
    b.pvHouse += pvHouse; b.batHouse += batHouse; b.batHousePv += batHouse * sPv; b.gridHouse += gridHouse;
    b.gridBat += gridBat; b.pvBat += pvBat; b.pvGrid += pvGrid; b.batGrid += batGrid;
    // konto sieci (prawdziwe pieniadze)
    if (pBuy !== undefined) {
      b.costKnown = true;
      const ecp = h.ec !== undefined || h.dist !== undefined ? h.ec ?? 0 : pBuy;
      b.impEc += h.imp * ecp;
      b.impDist += h.imp * (h.ec !== undefined || h.dist !== undefined ? h.dist ?? 0 : 0);
      b.impCost += h.imp * pBuy;
      b.houseGridCost += gridHouse * pBuy;
    }
    if (pSell !== undefined) b.expRev += h.exp * pSell;
    // wartosc decyzji: PV w domu zamiast sprzedazy, magazyn
    if (pBuy !== undefined && pSell !== undefined) b.pvSelfGain += pvHouse * (pBuy - pSell);
    if (pBuy !== undefined) b.batValueHouse += batHouse * pBuy;
    if (pSell !== undefined) b.batValueGrid += batGrid * pSell;
    b.batCostOut += take * avg;
    b.hours.push({ t: h.t, imp: h.imp, exp: h.exp, price: pSell, pv: h.pv, house });
  });
  const tot = ePv + eGrid + eUnk;
  if (tot > 0.001) {
    b.tankPv = ePv / tot;
    b.tankGrid = eGrid / tot;
    b.tankUnknown = eUnk / tot;
    b.tankAvgCost = costOk ? cost / tot : NaN;
  }
  b.coverage = b.house > 0 ? Math.min(1, (b.pvHouse + b.batHousePv) / b.house) : 0;
  const used = b.imp + b.pv + b.bout - b.exp - b.bin;
  b.haSelfSuff = used > 0 ? 1 - Math.min(1, b.imp / used) : 0;
  return b;
}
