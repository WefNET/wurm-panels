import Algebrite from 'algebrite';

type FarmGroup = { easy: string; challenge: string; hard: string };

function getDifficulty(modSkill: number): number {
    // same algorithm as original; Algebrite nroots can return complex structure
    const skill = -Math.round(-Math.pow(modSkill, 3) - 50000 * modSkill + 1000000);
    const s = skill < 0 ? `-x^3 -50000x ${skill}` : `-x^3 -50000x +${skill}`;
    const difficulty: any = (Algebrite as any).nroots(s);
    let realVal = 0;
    if (difficulty && difficulty.tensor && Array.isArray(difficulty.tensor.elem)) {
        for (let i = 0; i < difficulty.tensor.elem.length; i++) {
            const elem = difficulty.tensor.elem[i];
            if (elem && Object.prototype.hasOwnProperty.call(elem, 'd')) {
                const temp = Number(elem.d);
                if (temp > 0) realVal = temp;
            }
        }
    }
    return realVal;
}

function getFarmGroup(difficulty: number): FarmGroup {
    let toReturn: FarmGroup = {
        easy: '',
        challenge: '',
        hard: ''
    };

    if (difficulty < 5.5) {
        toReturn = { easy: 'nothing at 0 difficulty.', challenge: 'potato at 4 difficulty.', hard: 'cotton at 7 difficulty.' };
    } else if (difficulty >= 5.5 && difficulty < 8.5) {
        toReturn = { easy: 'potato at 4 difficulty.', challenge: 'cotton at 7 difficulty.', hard: 'wemp and rye at 10 difficulty.' };
    } else if (difficulty >= 8.5 && difficulty < 12.5) {
        toReturn = { easy: 'cotton at 7 difficulty.', challenge: 'wemp and rye at 10 difficulty.', hard: 'oat, cucumber, and pumpkin at 15 difficulty.' };
    } else if (difficulty >= 12.5 && difficulty < 17.5) {
        toReturn = { easy: 'wemp and rye at 10 difficulty.', challenge: 'oat, cucumber, and pumpkin at 15 difficulty.', hard: 'barley and reed at 20 difficulty.' };
    } else if (difficulty >= 17.5 && difficulty < 22.5) {
        toReturn = { easy: 'oat, cucumber, and pumpkin at 15 difficulty.', challenge: 'barley and reed at 20 difficulty.', hard: 'carrot at 25 difficulty.' };
    } else if (difficulty >= 22.5 && difficulty < 27.5) {
        toReturn = { easy: 'barley and reed at 20 difficulty.', challenge: 'carrot at 25 difficulty.', hard: 'wheat at 30 difficulty.' };
    } else if (difficulty >= 27.5 && difficulty < 32.5) {
        toReturn = { easy: 'carrot at 25 difficulty.', challenge: 'wheat at 30 difficulty.', hard: 'cabbage at 35 difficulty.' };
    } else if (difficulty >= 32.5 && difficulty < 37.5) {
        toReturn = { easy: 'wheat at 30 difficulty.', challenge: 'cabbage at 35 difficulty.', hard: 'corn at 40 difficulty.' };
    } else if (difficulty >= 37.5 && difficulty < 42.5) {
        toReturn = { easy: 'cabbage at 35 difficulty.', challenge: 'corn at 40 difficulty.', hard: 'tomatoes at 45 difficulty.' };
    } else if (difficulty >= 42.5 && difficulty < 50) {
        toReturn = { easy: 'corn at 40 difficulty.', challenge: 'tomatoes at 45 difficulty.', hard: 'lettuce at 55 difficulty.' };
    } else if (difficulty >= 50 && difficulty < 57.5) {
        toReturn = { easy: 'tomatoes at 45 difficulty.', challenge: 'lettus at 55 difficulty.', hard: 'onion and strawberry at 60 difficulty.' };
    } else if (difficulty >= 57.5 && difficulty < 62.5) {
        toReturn = { easy: 'lettus at 55 difficulty.', challenge: 'onion and strawberry at 60 difficulty.', hard: 'peas at 65 difficulty.' };
    } else if (difficulty >= 62.5 && difficulty < 67.5) {
        toReturn = { easy: 'onion and strawberry at 60 difficulty.', challenge: 'peas at 65 difficulty.', hard: 'garlic at 70 difficulty.' };
    } else if (difficulty >= 67.5 && difficulty < 75) {
        toReturn = { easy: 'peas at 65 difficulty.', challenge: 'garlic at 70 difficulty.', hard: 'rice at 80 difficulty.' };
    } else if (difficulty >= 75 && difficulty < 82.5) {
        toReturn = { easy: 'garlic at 70 difficulty.', challenge: 'rice at 80 difficulty.', hard: 'sugar beat at 85 difficulty.' };
    } else if (difficulty >= 82.5) {
        toReturn = { easy: 'rice at 80 difficulty.', challenge: 'sugar beat at 85 difficulty.', hard: 'nothing harder then 85 difficulty.' };
    }

    return toReturn;
}

function effectiveSkill(skill: number, toolQl: number, bonus = 0): number {
    const s = Number(skill);
    let eff: number;
    let linear_max: number;
    const tql = Number(toolQl);

    if (tql < s) {
        eff = (s + tql) / 2;
    } else {
        linear_max = tql - s;
        eff = s + (s * linear_max) / 100;
    }

    bonus = Number(bonus);
    if (bonus > 70) bonus = 70;

    linear_max = (100 + eff) / 2;
    const diffToMaxChange = Math.min(eff, linear_max - eff);

    if (bonus > 0) {
        const newBon = (diffToMaxChange * bonus) / 100;
        eff += newBon;
    }

    return eff;
}

function getGaussianMean(diff: number, eff: number): number {
    const d = Number(diff);
    const e = Number(eff);
    return (Math.pow(e, 3) - Math.pow(d, 3)) / 50000 + (e - d);
}

function farmingGetDiff(skill: number, rakeQl: number, rakeSkill: number, natureSkill: number) {
    const f_skills: Array<{ order: number; bonus: number; eff: number; mean: number; diff: number }> = [];
    const initial = { order: 1000, bonus: 0, eff: 0, mean: 0, diff: 0 };
    f_skills.push(initial);

    const _eff = effectiveSkill(skill, rakeQl, 0);
    let index: number;
    let forEnd: number;
    if (_eff - 30 < 0) {
        index = 0;
        forEnd = Math.floor(_eff);
    } else {
        index = Math.floor(_eff - 30);
        forEnd = Math.floor(_eff);
    }

    for (; index < forEnd; index++) {
        let bonus = getGaussianMean(index, natureSkill) / 10;
        bonus += getGaussianMean(index, rakeSkill);
        bonus = Math.min(70, bonus);
        bonus = Math.max(0, bonus);
        const eff2 = effectiveSkill(skill, rakeQl, bonus);
        const mean = getGaussianMean(index, eff2);
        const order = Math.abs(mean - 20);
        f_skills.push({ order, bonus, eff: eff2, mean, diff: index });
    }

    f_skills.sort((a, b) => a.order - b.order);
    const x = f_skills[0];
    return { eff1: x.eff, diff1: x.diff, bonus: x.bonus };
}

// DOM wiring
function safeGet<T extends HTMLElement>(id: string): T | null {
    return document.getElementById(id) as T | null;
}

function padFixed(n: number) {
    return String(n.toFixed(1)).padStart(4, '0');
}

export function initFarmingUI() {
    const closeButton = safeGet<HTMLButtonElement>('close-button');
    const tauriWindow: any = (window as any).__TAURI__?.window;

    async function closeCurrentWindow() {
        if (!tauriWindow) return;
        try {
            if (typeof tauriWindow.getCurrent === 'function') {
                const currentWindow = tauriWindow.getCurrent();
                if (currentWindow && typeof currentWindow.close === 'function') {
                    await currentWindow.close();
                    return;
                }
            }

            if (typeof tauriWindow.getCurrentWindow === 'function') {
                const currentWindow = tauriWindow.getCurrentWindow();
                if (currentWindow && typeof currentWindow.close === 'function') {
                    await currentWindow.close();
                    return;
                }
            }

            if (tauriWindow.appWindow && typeof tauriWindow.appWindow.close === 'function') {
                await tauriWindow.appWindow.close();
            }
        } catch (error) {
            console.error('Failed to close window:', error);
        }
    }

    if (closeButton) closeButton.addEventListener('click', () => { void closeCurrentWindow(); });

    const skillInput = safeGet<HTMLInputElement>('skill_in');
    const skillLabel = safeGet<HTMLLabelElement>('skill_in_label');
    const toolQlInput = safeGet<HTMLInputElement>('tool_ql_in');
    const toolQlLabel = safeGet<HTMLLabelElement>('tool_ql_label');
    const toolSkillInput = safeGet<HTMLInputElement>('tool_skill_in');
    const toolSkillLabel = safeGet<HTMLLabelElement>('tool_skill_label');
    const parentSkillInput = safeGet<HTMLInputElement>('parent_skill_in');
    const parentSkillLabel = safeGet<HTMLLabelElement>('parent_skill_label');

    const modifiedSpan = safeGet<HTMLSpanElement>('Modified_span');
    const diffSpan = safeGet<HTMLSpanElement>('diff_span');
    const easySpan = safeGet<HTMLSpanElement>('Easy_span');
    const challengeSpan = safeGet<HTMLSpanElement>('Challenge_span');
    const hardSpan = safeGet<HTMLSpanElement>('Hard_span');

    if (!skillInput || !toolQlInput || !toolSkillInput || !parentSkillInput || !skillLabel || !toolQlLabel || !toolSkillLabel || !parentSkillLabel || !modifiedSpan || !diffSpan || !easySpan || !challengeSpan || !hardSpan) {
        // Missing elements - nothing to initialize
        return;
    }

    const skillLabelDefault = 'Farming skill: ... ';
    const toolQlDefault = 'Tool QL: ........... ';
    const toolSkillDefault = 'Tool skill: ......... ';
    const parentSkillDefault = 'Parent skill: ...... ';

    skillLabel.innerHTML = skillLabelDefault + skillInput.value;
    toolQlLabel.innerHTML = toolQlDefault + toolQlInput.value;
    toolSkillLabel.innerHTML = toolSkillDefault + toolSkillInput.value;
    parentSkillLabel.innerHTML = parentSkillDefault + parentSkillInput.value;

    function updateUIFromInputs() {
        const farmResult = farmingGetDiff(Number(skillInput!.value), Number(toolQlInput!.value), Number(toolSkillInput!.value), Number(parentSkillInput!.value));
        modifiedSpan!.innerHTML = padFixed(farmResult.eff1);
        diffSpan!.innerHTML = padFixed(farmResult.diff1);
        const group = getFarmGroup(farmResult.diff1);
        easySpan!.innerHTML = group.easy;
        challengeSpan!.innerHTML = group.challenge;
        hardSpan!.innerHTML = group.hard;
    }

    updateUIFromInputs();

    const groupSkills = safeGet<HTMLInputElement>('group_skills');
    if (groupSkills) {
        groupSkills.addEventListener('click', () => {
            groupSkills.checked = !groupSkills.checked;
            if (groupSkills.hasAttributes()) {
                let output = '';
                for (const attr of groupSkills.attributes) {
                    output += `${attr.name} -> ${attr.value}\n`;
                }
                console.log(output);
            } else {
                console.log('no attributes');
            }
        });
    }

    skillInput.addEventListener('input', () => {
        skillLabel.innerHTML = skillLabelDefault + String(skillInput.value).padStart(2, '0');
        updateUIFromInputs();
    });

    toolQlInput.addEventListener('input', () => {
        toolQlLabel.innerHTML = toolQlDefault + String(toolQlInput.value).padStart(2, '0');
        updateUIFromInputs();
    });

    toolSkillInput.addEventListener('input', () => {
        toolSkillLabel.innerHTML = toolSkillDefault + String(toolSkillInput.value).padStart(2, '0');
        updateUIFromInputs();
    });

    parentSkillInput.addEventListener('input', () => {
        parentSkillLabel.innerHTML = parentSkillDefault + String(parentSkillInput.value).padStart(2, '0');
        updateUIFromInputs();
    });
}

// Initialize when document is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initFarmingUI());
} else {
    initFarmingUI();
}

export { getDifficulty, getFarmGroup, effectiveSkill, getGaussianMean, farmingGetDiff };
