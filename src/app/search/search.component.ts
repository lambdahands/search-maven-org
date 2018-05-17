/*
 * Copyright 2018-present Sonatype, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { Component, Input, OnInit } from '@angular/core';
import { SearchService } from "./search.service";
import 'rxjs/add/operator/startWith';
import 'rxjs/add/observable/merge';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/debounceTime';
import 'rxjs/add/operator/distinctUntilChanged';
import 'rxjs/add/observable/fromEvent';
import { NotificationService } from "../shared/notifications/notification.service";
import { ActivatedRoute, Router } from "@angular/router";
import { BehaviorSubject } from "rxjs/BehaviorSubject";
import { FormControl } from "@angular/forms";
import { SearchDoc } from "./api/search-doc";
import { SearchSuggestion } from "./api/search-suggestion";
import { SearchResult } from "./api/search-result";

@Component({
  selector: 'app-search',
  templateUrl: './search.component.html',
  styleUrls: ['./search.component.scss']
})
export class SearchComponent implements OnInit {

  searchDocs: BehaviorSubject<SearchDoc[]> = new BehaviorSubject<SearchDoc[]>([]);

  stateCtrl: FormControl;

  query: string;

  constructor(private searchService: SearchService,
              private router: Router,
              private route: ActivatedRoute,
              private notificationService: NotificationService) {
  }

  ngOnInit() {
    this.stateCtrl = new FormControl();
    this.stateCtrl.valueChanges.subscribe(s => this.search(s));
    this.route.queryParams.subscribe(params => {
      this.stateCtrl.setValue(params['q']);
    })
  }

  navigate() {
    if (this.query) {
      this.router.navigate(['/search'], {queryParams: {q: this.query}});
      this.clearSearchResults();
    }
  }

  clearQuery() {
    this.stateCtrl.setValue('');
    this.clearSearchResults();
  }

  private search(query: string) {
    this.query = this.parseOnGrouping(query);

    if (this.query) {
      this.searchService
        .search(this.query, 0)
        .subscribe(
          searchResult => this.handleSearchResults(searchResult),
          error => this.handleError(error))
    } else {
      this.clearSearchResults();
    }
  }

  private parseOnGrouping(query: string): string {

    if (query) {
      // do cleaning
      query = query.trim();
      query = query.replace(/ and /gi, w => w.toUpperCase());

      // Is it a manual search by identifier of Group, Artifact, Version, Packaging, Classifier, Class name or SHA-1
      if (query.length >= 2 && query.charAt(0).match(/[gavplc1]/i) && query.charAt(1) == ':') {
        return query;
      }

      // is it a automatic search for SHA1
      let groupBySpace: string[] = query.split(' ');
      if (groupBySpace.length == 1 && groupBySpace[0].match(/^[0-9a-f]{40}$/i)) {
        return '1:' + groupBySpace[0].trim() + '';
      }

      // is it a automatic search for GAV
      let groupBySemiColon: string[] = query.split(':').map((value) => value.trim());
      if (groupBySemiColon.length >= 2) {
        console.log("doing auto");

        if (groupBySemiColon[0].length) {
          query = 'g:' + groupBySemiColon[0];

          if (groupBySemiColon.length >= 2 && groupBySemiColon[1].length) {
            query += ' AND a:' + groupBySemiColon[1];
          }

          if (groupBySemiColon.length >= 3 && groupBySemiColon[2].length) {
            query += ' AND v:' + groupBySemiColon[2];
          }

          return query;
        }
      }
    }

    // we found nothing special, search the universe.
    return query;
  }

  private handleSearchResults(searchResult: SearchResult) {
    if (searchResult.response.docs.length) {
      this.searchDocs.next(searchResult.response.docs);
    } else if (searchResult.spellcheck && searchResult.spellcheck.suggestion) {
      this.searchSuggestion(searchResult.spellcheck.suggestion);
    } else {
      this.clearSearchResults();
    }
  }

  private searchSuggestion(suggestion: SearchSuggestion) {
    if (suggestion.suggestionResponse) {
      this.searchService
        .search(suggestion.suggestionResponse.suggestion[0], 0)
        .subscribe(
          searchResult => {
            this.searchDocs.next(searchResult.response.docs)
          },
          error => this.handleError(error));
    }
  }

  private clearSearchResults() {
    this.searchDocs.next([]);
  }

  private handleError(error) {
    // For "know" exceptions, don't notify users
    if (error.status == 400 &&
      (error.error.includes('org.apache.lucene.queryParser.ParseException') ||
      error.error.includes('400, msg: missing query string') ||
      error.error.includes('Solr returned 400, msg:'))) {
      return;
    } else if (error.status == 500 && (error.statusText.includes('IllegalArgumentException'))) {
      return;
    }

    this.notificationService.notifySystemUnavailable();
  }
}
