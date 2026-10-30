import { Modules } from '@kaetram/common/network';

export default {
    INVALID_LEVEL(type: Modules.Skills, level: number) {
        switch (type) {
            case Modules.Skills.Fletching: {
                return `你的制弓等级必须达到 ${level} 级才能制作。`;
            }

            case Modules.Skills.Chiseling:
            case Modules.Skills.Crafting: {
                return `你的制作等级必须达到 ${level} 级才能制作。`;
            }

            case Modules.Skills.Cooking: {
                return `你的烹饪等级必须达到 ${level} 级才能烹饪。`;
            }

            case Modules.Skills.Smithing: {
                return `你的锻造等级必须达到 ${level} 级才能锻造。`;
            }

            case Modules.Skills.Smelting: {
                return `你的冶炼等级必须达到 ${level} 级才能冶炼。`;
            }

            case Modules.Skills.Alchemy: {
                return `你的炼金等级必须达到 ${level} 级才能酿造。`;
            }

            default: {
                return 'INVALID_LEVEL() 未实现';
            }
        }
    }
};
