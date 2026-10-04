export enum RenderProfile {
  Simple = 0,
  LargeCoordinates = 1,
  HeavyLwPolyline = 2,
  HeavyHatch = 3,
  Complex = 4,
  Unparseable = 5,
  HeavyEntity = 6,
  MediumEntity = 7,
  Light = 8,
  Standard = 9,
  Heavy = 10,
  Mega = 11,
  Ultra = 12,
}

export function decodeRenderProfile(flags: number): RenderProfile {
  const profileType = flags & 0x0F;
  switch (profileType) {
    case 0: return RenderProfile.Simple;
    case 1: return RenderProfile.LargeCoordinates;
    case 2: return RenderProfile.HeavyLwPolyline;
    case 3: return RenderProfile.HeavyHatch;
    case 4: return RenderProfile.Complex;
    case 5: return RenderProfile.Unparseable;
    case 6: return RenderProfile.HeavyEntity;
    case 7: return RenderProfile.MediumEntity;
    case 8: return RenderProfile.Light;
    case 9: return RenderProfile.Standard;
    case 10: return RenderProfile.Heavy;
    case 11: return RenderProfile.Mega;
    case 12: return RenderProfile.Ultra;
    default: return RenderProfile.Simple;
  }
}

export function decodeComplexFlags(flags: number): number {
  return (flags >> 4) & 0xFF;
}