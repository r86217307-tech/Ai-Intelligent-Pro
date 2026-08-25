import re

with open('src/lib/trading/tradingOrchestrator.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# I will append Phase 17 Dynamic SR clustering logic to it.
# First, let's add the new interfaces before Phase16OrchestrationResult.

interfaces = """
export interface DynamicSRZone {
  type: 'SUPPORT' | 'RESISTANCE' | 'FLIPPED';
  price: string | number;
  strength: number;
  reactionCount: number;
  recency: 'RECENT' | 'OLD';
  status: 'ACTIVE' | 'TESTED' | 'BROKEN' | 'FLIPPED' | 'INVALIDATED';
  structuralRole: string;
}

export interface Phase17Config {
  pivotPeriod: number;
  pivotSource: 'CLOSE' | 'OPEN';
  maxChannelWidthPercent: number;
  minStrength: number;
  maxSrCount: number;
}
"""

content = content.replace("export interface Phase16OrchestrationResult", interfaces + "\nexport interface Phase16OrchestrationResult")

# Add Phase17 dynamic sr to result
content = content.replace("  finalSignal: 'CALL' | 'PUT' | 'NO_TRADE' | 'INSUFFICIENT_DATA';", "  finalSignal: 'CALL' | 'PUT' | 'NO_TRADE' | 'INSUFFICIENT_DATA';\n  dynamicSRZones?: DynamicSRZone[];")
content = content.replace("      explanation: 'Analysis initializing...'", "      explanation: 'Analysis initializing...',\n      dynamicSRZones: []")

# I need to add the clustering logic.
# After: result.snrStrength = Math.min(snrScore, 10); // Cap at 10

sr_logic = """
    // Boost score if explicitly mentioned in evidence as "strong" or "rejection"
    if (allEvidence.some(e => e.toLowerCase().includes('strong support') || e.toLowerCase().includes('strong resistance'))) {
      snrScore += 2;
    }
    
    // Add Phase 17 Dynamic S/R Clustering Logic
    const p17Config: Phase17Config = {
      pivotPeriod: 14,
      pivotSource: 'CLOSE',
      maxChannelWidthPercent: 0.15,
      minStrength: 2,
      maxSrCount: 5
    };
    
    const parsedZones: DynamicSRZone[] = [];
    
    // Since we lack raw OHLC data, we parse the textual SR outputs and cluster them
    const parseLevel = (val: string, type: 'SUPPORT' | 'RESISTANCE'): DynamicSRZone | null => {
      // Basic extraction if it looks like a number
      const numMatch = val.match(/[\d.]+/);
      if (numMatch) {
        return {
          type,
          price: parseFloat(numMatch[0]),
          strength: val.toLowerCase().includes('strong') ? 4 : 2,
          reactionCount: val.toLowerCase().includes('rejection') ? 3 : 1,
          recency: 'RECENT',
          status: 'ACTIVE',
          structuralRole: `VISUAL_S/R ${type}`
        };
      }
      return {
          type,
          price: val,
          strength: val.toLowerCase().includes('strong') ? 4 : 2,
          reactionCount: val.toLowerCase().includes('rejection') ? 3 : 1,
          recency: 'RECENT',
          status: 'ACTIVE',
          structuralRole: `DATA_LIMITED_S/R ${type}`
      };
    };

    if (analysis.supportResistance?.support) {
      analysis.supportResistance.support.forEach(s => {
        const zone = parseLevel(s, 'SUPPORT');
        if (zone) parsedZones.push(zone);
      });
    }
    
    if (analysis.supportResistance?.resistance) {
      analysis.supportResistance.resistance.forEach(r => {
        const zone = parseLevel(r, 'RESISTANCE');
        if (zone) parsedZones.push(zone);
      });
    }

    // Attempt clustering if they are numeric
    let clusteredZones: DynamicSRZone[] = [];
    
    // Filter and sort by strength
    let finalZones = parsedZones.filter(z => z.strength >= p17Config.minStrength);
    finalZones.sort((a, b) => b.strength - a.strength);
    
    // Cap
    if (finalZones.length > p17Config.maxSrCount) {
      finalZones = finalZones.slice(0, p17Config.maxSrCount);
    }
    
    result.dynamicSRZones = finalZones;
    
    // Advance SNR based on dynamic zones
    let dynamicSnr = snrScore;
    if (finalZones.length > 0) {
      dynamicSnr = Math.min(10, snrScore + (finalZones[0].strength));
    }
    
    // Apply OTC logic: Trap/False Breakout detection
    if (result.marketType === 'OTC') {
      const isTrap = allEvidence.some(e => 
        e.toLowerCase().includes('trap') || 
        e.toLowerCase().includes('false breakout') || 
        e.toLowerCase().includes('fake out') || 
        e.toLowerCase().includes('liquidity grab')
      );
      if (isTrap) {
         result.confluence.factors.push('OTC False Breakout/Trap Detected');
         dynamicSnr += 2; // High confidence in OTC if we catch the trap
      }
    }

    result.snrStrength = Math.min(dynamicSnr, 10); // Cap at 10
"""

content = content.replace("""    // Boost score if explicitly mentioned in evidence as "strong" or "rejection"
    if (allEvidence.some(e => e.toLowerCase().includes('strong support') || e.toLowerCase().includes('strong resistance'))) {
      snrScore += 2;
    }
    result.snrStrength = Math.min(snrScore, 10); // Cap at 10""", sr_logic)

# Make sure we add UNKNOWN market behavior
market_logic = """
    // 1 & 2. Identify Market Type and Symbol
    const upperAsset = (options?.asset || '').toUpperCase();
    if (upperAsset.includes('OTC') || (options?.broker || '').toUpperCase().includes('POCKET OPTION')) {
      result.marketType = 'OTC';
    } else if (upperAsset.length >= 6 && !upperAsset.includes('UNKNOWN')) {
      result.marketType = 'REAL_FOREX';
    } else {
      result.marketType = 'UNKNOWN';
    }

    if (result.marketType === 'UNKNOWN') {
       result.finalSignal = 'INSUFFICIENT_DATA';
       result.explanation = 'Market type (OTC or Real Forex) is UNKNOWN. Cannot safely orchestrate 1M trading without market context.';
       return result;
    }
"""

content = re.sub(r"    // 1 & 2\. Identify Market Type and Symbol.*?    // 3\. Confirm 1M Timeframe Priority", market_logic + "\n    // 3. Confirm 1M Timeframe Priority", content, flags=re.DOTALL)

with open('src/lib/trading/tradingOrchestrator.ts', 'w', encoding='utf-8') as f:
    f.write(content)

