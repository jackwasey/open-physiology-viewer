import {NgModule, Component, Input, Output, EventEmitter, ChangeDetectionStrategy} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormsModule, ReactiveFormsModule} from '@angular/forms';
import {MatSliderModule} from '@angular/material/slider'
import {MatCheckboxModule} from '@angular/material/checkbox'
import {MatRadioModule} from '@angular/material/radio'
import {keys} from 'lodash-bound';
import {SearchBarModule} from './gui/searchBar';

import {ResourceInfoModule} from './gui/resourceInfo';
import {LogInfoModule, LogInfoDialog} from "./gui/logInfoDialog";
import {ExternalSearchModule} from "./gui/externalSearchBar";
import {$Field} from "../model";
import {StopPropagation} from "./gui/stopPropagation";

/**
 * @ignore
 */
@Component({
    selector: 'settingsPanel',
    changeDetection: ChangeDetectionStrategy.Default,
    template: ` 
            <section class="w3-padding-small"> 
 
                <!--Highlighted entity-->

                <fieldset *ngIf="config.highlighted" class="w3-card w3-round w3-margin-small">
                    <legend>Highlighted</legend>
                    <resourceInfoPanel *ngIf="!!highlighted" [resource]="highlighted"> </resourceInfoPanel>
                </fieldset>
 
                <!--Search bar-->

                <fieldset class="w3-card w3-round w3-margin-small-small">
                    <legend>Search</legend>
                    <searchBar [selected]="_selectedName" [searchOptions]="searchOptions"
                               (selectedItemChange)="selectBySearch($event)">
                    </searchBar>
                </fieldset>

                <!--Selected resource-->

                <fieldset *ngIf="config.selected" class="w3-card w3-round w3-margin-small">
                    <legend>Selected</legend>
                    <resourceInfoPanel *ngIf="!!_selected" [resource]="_selected">
                    </resourceInfoPanel>
                    <button *ngIf="!!_selected && _selected.external" title="Open external links"
                            class="w3-hover-light-grey w3-right" (click)="onOpenExternal.emit(_selected)">
                        <i class="fa fa-link"> </i>
                    </button>
                    <button *ngIf="!!_selected" title="Edit"
                            class="w3-hover-light-grey w3-right" (click)="onEditResource.emit(_selected)">
                        <i class="fa fa-edit"> </i>
                    </button>
                </fieldset>

                <!--SciGraph search-->
                
                <fieldset class="w3-card w3-round w3-margin-small">
                    <legend>SciGraph search</legend>
                    <sciGraphSearch [selected]="_selected"> 
                    </sciGraphSearch>
                </fieldset>
                
                <!--Group controls-->

                <fieldset *ngIf="!!groups" class="w3-card w3-round w3-margin-small">
                    <legend>Groups</legend>
                    <span *ngFor="let group of groups">
                        <mat-checkbox matTooltip="Toggle groups" labelPosition="after" class="w3-margin-left"
                                      [checked] = "!group.hidden"
                                      (change)  = "onToggleGroup.emit(group)"> 
                            {{group.namespace? group.namespace + ":" : ""}}{{group.name || group.id}}
                        </mat-checkbox>
                    </span>
                </fieldset>

                <!--Dynamic groups-->
                
                <fieldset *ngIf="!!dynamicGroups" class="w3-card w3-round w3-margin-small">
                    <legend>Dynamic groups</legend>
                    <span *ngFor="let group of dynamicGroups">
                        <mat-checkbox matTooltip="Toggle groups" labelPosition="after" class="w3-margin-left"
                                      [checked] = "!group.hidden"
                                      (change)  = "onToggleGroup.emit(group)"> 
                            {{group.name || group.id}}
                        </mat-checkbox>
                    </span>
                </fieldset>
                
                <!--Scaffold controls-->

                <fieldset *ngIf="!!scaffolds" class="w3-card w3-round w3-margin-small">
                    <legend>Scaffolds</legend>
                    <span *ngFor="let scaffold of scaffolds">
                        <mat-checkbox matTooltip="Toggle scaffolds" labelPosition="after" class="w3-margin-left"
                                      [checked] = "!scaffold.hidden"
                                      (change)  = "onToggleGroup.emit(scaffold)"> 
                            {{scaffold._parent? scaffold._parent.id + ":" : ""}}{{scaffold.name || scaffold.id}}
                        </mat-checkbox>
                    </span>
                </fieldset>

                <!--Layout config-->

                <fieldset class="w3-card w3-round w3-margin-small">
                    <legend>Layout</legend>
                    <mat-checkbox matTooltip="Toggle view mode" labelPosition="after" class="w3-margin-left"
                                  (change)="toggleMode()"
                                  [checked]="config.layout.numDimensions === 2"> 2D mode
                    </mat-checkbox>
                    <mat-checkbox matTooltip="Toggle lyphs" labelPosition="after" class="w3-margin-left"
                                  (change)="toggleLayout('showLyphs')"
                                  [checked]="config.layout.showLyphs"> Lyphs
                    </mat-checkbox>
                    <mat-checkbox matTooltip="Toggle layers" labelPosition="after"
                                  [disabled]="!config.layout.showLyphs" class="w3-margin-left"
                                  (change)="toggleLayout('showLayers')"
                                  [checked]="config.layout.showLayers"> Layers
                    </mat-checkbox>
                    <mat-checkbox matTooltip="Toggle 3D lyphs" labelPosition="after" 
                                  [disabled]="!config.layout.showLyphs" class="w3-margin-left"
                                  (change)="toggleLayout('showLyphs3d')"                                 
                                  [checked]="config.layout.showLyphs3d"> Lyphs 3D
                    </mat-checkbox>
                    <mat-checkbox matTooltip="Toggle coalescences" labelPosition="after"
                                  [disabled]="!config.layout.showLyphs" class="w3-margin-left"
                                  (change)="toggleLayout('showCoalescences')"
                                  [checked]="config.layout.showCoalescences"> Coalescences
                    </mat-checkbox>
                </fieldset>

                <!--Label config-->

                <fieldset class="w3-card w3-round w3-margin-small">
                    <legend>Labels</legend>
                    <span *ngFor="let labelClass of _labelClasses">
                        <mat-checkbox matTooltip="Toggle labels" labelPosition="after" class="w3-margin-left"
                                      [checked]="config.showLabels[labelClass]"
                                      (change)="updateShowLabels(labelClass)"> {{labelClass}}
                        </mat-checkbox> 
                    </span>
                    <span *ngFor="let labelClass of _labelClasses">
                        <fieldset *ngIf="config.showLabels[labelClass]" class="w3-card w3-round w3-margin-small">
                            <legend>{{labelClass}} label</legend>
                            <mat-radio-group [(ngModel)]="config.labels[labelClass]">
                                <mat-radio-button *ngFor="let labelProp of _labelProps" class="w3-margin-left"
                                                  [value]="labelProp"
                                                  (change)="updateLabelContent(labelClass, labelProp)"> {{labelProp}}
                                </mat-radio-button>
                            </mat-radio-group>
                        </fieldset>
                    </span>
                </fieldset>
                
                <!--View helpers-->

                <fieldset class="w3-card w3-round w3-margin-small">
                    <legend>Helpers</legend>
                    <span *ngFor="let helper of _helperKeys">
                        <mat-checkbox matTooltip="Toggle planes" labelPosition="after" class="w3-margin-left"
                                      [checked]="_showHelpers.has(helper)"
                                      (change)="toggleHelperPlane(helper)"> {{helper}}
                        </mat-checkbox> 
                    </span>
                </fieldset>                                           
            </section>
    `,
    styles: [`
        :host >>> fieldset {
            border: 1px solid grey;
            margin: 2px;
        }

        :host >>> legend {
            padding: 0.2em 0.5em;
            border : 1px solid grey;
            color  : grey;
            font-size: 90%;
            text-align: right;
        }
    `]
})
export class SettingsPanel {
    _config;
    _helperKeys;
    _showHelpers;
    _labelProps;
    _labelClasses;
    _selectedName;

    @Input() groups;

    @Input() dynamicGroups;

    @Input() scaffolds;

    @Input('config') set config(newConfig) {
        if (this._config !== newConfig) {
            this._config = newConfig;
            this._labelClasses = this._config[$Field.labels]::keys();
            let ids = this._config.visibleGroups || [];
            this._showGroups = new Set((this.groups||[]).filter(g => ids.includes(g.id)));
        }
    }

    @Input('helperKeys') set helperKeys(newHelperKeys){
        if (this._helperKeys !== newHelperKeys) {
            this._helperKeys = newHelperKeys;
            this._showHelpers = new Set([]);
        }
    }
    @Input('selected') set selected(entity){
        if (this.selected !== entity) {
            this._selected = entity;
            this._selectedName = entity ? entity.name || "" : "";
        }
    }
    @Input() searchOptions;
    @Input() highlighted;

    @Output() onSelectBySearch     = new EventEmitter();
    @Output() onOpenExternal       = new EventEmitter();
    @Output() onEditResource       = new EventEmitter();
    @Output() onUpdateShowLabels   = new EventEmitter();
    @Output() onUpdateLabelContent = new EventEmitter();
    @Output() onToggleGroup        = new EventEmitter();
    @Output() onToggleMode         = new EventEmitter();
    @Output() onToggleLayout       = new EventEmitter();
    @Output() onToggleHelperPlane  = new EventEmitter();

    constructor() {
        this._labelProps    = [$Field.id, $Field.name];
        this._showHelpers   = new Set([]);
    }

    get config() {
        return this._config;
    }

    get selected(){
        return this._selected;
    }

    get scaffolds(){
        return this._scaffolds;
    }

    selectBySearch(name) {
        if (name !== this._selectedName) {
            this._selectedName = name;
            this.onSelectBySearch.emit(name);
        }
    }

    toggleMode(){
        this.config.layout.numDimensions = (this.config.layout.numDimensions === 3)? 2: 3;
        this.onToggleMode.emit(this.config.layout.numDimensions);
    }

    toggleLayout(prop){
        this.config.layout[prop] = !this.config.layout[prop];
        this.onToggleLayout.emit(prop);
    }

    updateShowLabels(labelClass) {
        this.config.showLabels[labelClass] = !this.config.showLabels[labelClass];
        this.onUpdateShowLabels.emit(this.config.showLabels||{});
    }

    updateLabelContent(labelClass, labelProp) {
        this.config.labels[labelClass] = labelProp;
        this.onUpdateLabelContent.emit(this.config.labels||{})
    }

    toggleHelperPlane(helper) {
        if (!helper) { return; }
        if (this._showHelpers.has(helper)){
            this._showHelpers.delete(helper);
        } else {
            this._showHelpers.add(helper);
        }
        this.onToggleHelperPlane.emit(helper);
    }
}

@NgModule({
    imports: [CommonModule, FormsModule, ReactiveFormsModule, ResourceInfoModule, ExternalSearchModule,
        MatSliderModule, SearchBarModule, MatCheckboxModule, MatRadioModule, LogInfoModule],
    declarations: [SettingsPanel, StopPropagation],
    entryComponents: [LogInfoDialog],
    exports: [SettingsPanel]
})
export class SettingsPanelModule {
}