import Menu from './menu';

import Util from '../utils/util';

import { Modules } from '@kaetram/common/network';

// Chinese labels for the enchantment enum values.
let ENCHANTMENT_LABELS: { [key: number]: string } = {
    [Modules.Enchantment.Bloodsucking]: '吸血',
    [Modules.Enchantment.Critical]: '暴击',
    [Modules.Enchantment.Evasion]: '闪避',
    [Modules.Enchantment.Thorns]: '荆棘',
    [Modules.Enchantment.Explosive]: '爆炸',
    [Modules.Enchantment.Stun]: '眩晕',
    [Modules.Enchantment.AntiStun]: '抗眩晕',
    [Modules.Enchantment.Splash]: '溅射',
    [Modules.Enchantment.DoubleEdged]: '双刃'
};

import { formatAffix } from '@kaetram/common/types/affixes';

import type { Bonuses, Enchantments, Stats, Affix, RefineData } from '@kaetram/common/types/item';

export default class Actions extends Menu {
    private page: HTMLElement = document.querySelector('#action-page')!;

    // Contains the list of actions.
    private list: HTMLUListElement = document.querySelector('#action-page > ul')!;

    // Info about the current action.
    private name: HTMLElement = document.querySelector('#action-page > .action-item-name')!;
    private description: HTMLElement = document.querySelector(
        '#action-page > .action-item-description'
    )!;

    // Drop dialog elements
    public dropDialog: HTMLElement = document.querySelector('#action-drop')!;
    private dropCount: HTMLInputElement = document.querySelector('#action-drop .dialog-count')!;
    private dropAccept: HTMLElement = document.querySelector('#action-drop .dialog-accept')!;
    private dropCancel: HTMLElement = document.querySelector('#action-drop .dialog-cancel')!;

    private buttonCallback?: (menuAction: Modules.MenuActions) => void;
    private dropCallback?: (count: number) => void;

    public constructor() {
        super('#action-container');

        this.dropCancel.addEventListener('click', this.hideDropDialog.bind(this));
        this.dropAccept.addEventListener('click', this.handleDrop.bind(this));
    }

    /**
     * Handles the click event for the drop dialog.
     */

    public handleDrop(): void {
        let count = this.dropCount.valueAsNumber;

        // Reset the input field value
        this.dropCount.value = '';

        // Hide the drop dialog.
        this.hideDropDialog();

        // Exit the actions menu dialog
        this.hide();

        // Send the callback to the inventory handler.
        this.dropCallback?.(count);
    }

    /**
     * Opens the action menu with a specified array of actions. We first clear
     * all the previous actions and load the new ones in.
     * @param actions Array of actions to append to our list prior to displaying.
     * @param name The name of the item that the actions are being performed on.
     * @param attackStats The attack stats of the item.
     * @param defenseStats The defense stats of the item.
     * @param bonuses The bonuses of the item.
     */

    public override show(
        actions: Modules.MenuActions[],
        name: string,
        attackStats: Stats,
        defenseStats: Stats,
        bonuses: Bonuses,
        enchantments: Enchantments,
        itemDescription = '',
        affixes?: Affix[],
        refine?: RefineData
    ): void {
        this.clear();

        for (let action of actions) this.add(action);

        // Update the name of the selected item.
        this.name.innerHTML = name;

        // Determine whether the description is for objects or items.
        if (itemDescription) this.description.innerHTML = itemDescription;
        else {
            // Clear the description.
            this.description.innerHTML = '';

            let attack = document.createElement('div'),
                defense = document.createElement('div'),
                bonusesDiv = document.createElement('div'),
                enchantmentsDiv = document.createElement('div');

            // Set the id's of the divs.
            attack.id = 'action-description-attack';
            defense.id = 'action-description-defense';
            bonusesDiv.id = 'action-description-bonuses';
            enchantmentsDiv.id = 'action-description-enchantments';

            // Apply the attack stats to the attack div.
            attack.innerHTML = `<u>攻击属性：</u>
                钝击：${attackStats.crush} <br>
                挥砍：${attackStats.slash} <br>
                突刺：${attackStats.stab} <br>
                射术：${attackStats.archery} <br>
                魔法：${attackStats.magic} <br>`;

            // Apply the defense stats to the defense div.
            defense.innerHTML = `<u>防御属性：</u>
                钝击：${defenseStats.crush} <br>
                挥砍：${defenseStats.slash} <br>
                突刺：${defenseStats.stab} <br>
                射术：${defenseStats.archery} <br>
                魔法：${defenseStats.magic} <br>`;

            // Apply the bonuses to the bonuses div.
            bonusesDiv.innerHTML = `<u>加成：</u>
                精准：${bonuses.accuracy} <br>
                力量：${bonuses.strength} <br>
                射术：${bonuses.archery} <br>
                魔法：${bonuses.magic} <br>`;

            // If the item has enchantments, apply them to the enchantments div.
            if (Object.keys(enchantments).length > 0) {
                // Apply the enchantments to the enchantments div.
                enchantmentsDiv.innerHTML = `<u>附魔：</u>`;

                for (let key in enchantments) {
                    let enchantment = Modules.Enchantment[key];

                    enchantmentsDiv.innerHTML += `${
                        ENCHANTMENT_LABELS[Number(enchantment)] || enchantment
                    }: ${enchantments[key].level} <br>`;
                }
            }

            // Pocket Legends random affixes (词条): colour-coded by max level.
            if (affixes && affixes.length > 0) {
                let affixesDiv = document.createElement('div');
                affixesDiv.id = 'action-description-affixes';

                let maxLevel = Math.max(...affixes.map((a) => a.level)),
                    colour = maxLevel >= 6 ? '#c78bff' : maxLevel >= 4 ? '#5aa2ff' : '#6ddb6d';

                affixesDiv.innerHTML = `<u style='color:${colour};'>词条 (最高+${maxLevel})：</u><br>`;
                affixesDiv.innerHTML += affixes
                    .map((a) => `<span style='color:${colour};'>${formatAffix(a)}</span>`)
                    .join('<br>');

                this.description.append(affixesDiv);
            }

            // Pocket Legends refine (强化等级 + 祝福油) display.
            if (refine?.level || refine?.blessing) {
                let refineDiv = document.createElement('div');
                refineDiv.id = 'action-description-refine';

                let parts: string[] = [];

                if (refine.level)
                    parts.push(`<span style='color:#ffb347;'><b>+${refine.level}</b> 强化</span>`);

                if (refine.blessing)
                    parts.push(
                        refine.blessing > 0
                            ? `<span style='color:#6ddb6d;'>祝福 +${refine.blessing}</span>`
                            : `<span style='color:#ff6d6d;'>诅咒 ${refine.blessing}</span>`
                    );

                refineDiv.innerHTML = parts.join(' ');
                this.description.append(refineDiv);
            }

            this.description.append(attack, defense, bonusesDiv, enchantmentsDiv);
        }

        super.show();
    }

    /**
     * Implementation of the `hide` superclass where we also hide the
     * drop dialog upon exiting the actions menu.
     */

    public override hide(): void {
        super.hide();

        // Hide the drop dialog.
        this.hideDropDialog();
    }

    /**
     * Appends an action element to the list of actions.
     * @param menuAction Enumeration containing the string text of the action.
     */

    public override add(menuAction: Modules.MenuActions): void {
        let element = document.querySelector(`.action-${menuAction}`);

        if (!element) {
            element = document.createElement('li');

            // Set the type of action to the button element
            element.classList.add('action-button', `action-${menuAction}`);

            this.list.append(element);
        }

        // Assign an action when the element is clicked.
        element.addEventListener('click', (e) => {
            e.preventDefault();

            this.buttonCallback?.(menuAction);
        });
    }

    /**
     * Hides the description and shows the drop dialog. Also
     * focuses on the input field for the drop dialog.
     */

    public showDropDialog(): void {
        Util.fadeIn(this.dropDialog);

        this.page.classList.add('dimmed');

        this.dropCount.value = '1';
        this.dropCount.focus();
    }

    /**
     * Hides the drop dialog and brings back the description info.
     */

    public hideDropDialog(): void {
        Util.fadeOut(this.dropDialog);

        this.page.classList.remove('dimmed');
    }

    /**
     * Removes all the `div` action elements from the list.
     */

    private clear(): void {
        this.list.innerHTML = '';
    }

    /**
     * Callback handler for when an action button has been pressed.
     * @param callback Contains the action that was pressed.
     */

    public onButton(callback: (menuAction: Modules.MenuActions) => void): void {
        this.buttonCallback = callback;
    }

    /**
     * Callback handler for when the drop dialog has been accepted.
     * @param callback Contains the number of items to be dropped.
     */

    public onDrop(callback: (count: number) => void): void {
        this.dropCallback = callback;
    }
}
