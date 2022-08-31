/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as lsp from 'vscode-languageserver';
import { DocumentStore } from '../documentStore';
import { Trees } from '../trees';
import { getDocumentSymbols } from './documentSymbols';
import { SymbolIndex } from './symbolIndex';

export class WorkspaceSymbol {

	constructor(
		private readonly _documents: DocumentStore,
		private readonly _trees: Trees,
		private readonly _symbols: SymbolIndex
	) { }

	register(connection: lsp.Connection) {
		connection.client.register(lsp.WorkspaceSymbolRequest.type, { resolveProvider: true });
		connection.onRequest(lsp.WorkspaceSymbolRequest.type, this.provideWorkspaceSymbols.bind(this));
		connection.onRequest(lsp.WorkspaceSymbolResolveRequest.type, this.resolveWorkspaceSymbol.bind(this));
	}

	// Custom type improted from the vscode language server library 
	async provideWorkspaceSymbols(params: lsp.WorkspaceSymbolParams): Promise<lsp.WorkspaceSymbol[]> {
		const result: lsp.WorkspaceSymbol[] = [];

		await Promise.race([
			// Calling the update function on the SymbolIndex
			this._symbols.update(),
			new Promise(resolve => setTimeout(resolve, 250))
		]);

		// WorkspaceSymbolParams contains the query of interest
		const all = this._symbols.index.query(params.query);

		out: for (const [name, map] of all) {
			for (const [uri, info] of map) {
				for (const kind of info.definitions) {
					const newLen = result.push(lsp.WorkspaceSymbol.create(name, kind, uri, lsp.Range.create(0, 0, 0, 0)));
					if (newLen > 20_000) {
						break out;
					}
				}
			}
		}

		return result;
	}

	async resolveWorkspaceSymbol(item: lsp.WorkspaceSymbol): Promise<lsp.WorkspaceSymbol> {
		// TODO@jrieken handle the case where a file has multiple symbols with the same name _and_ kind
		const document = await this._documents.retrieve(item.location.uri);
		const symbols = getDocumentSymbols(document, this._trees, true);
		for (let candidate of symbols) {
			if (candidate.name === item.name && candidate.kind === item.kind) {
				// lsp contains SymbolInformation and DocumentSymbol as possible types
				return lsp.SymbolInformation.create(item.name, item.kind, candidate.selectionRange, item.location.uri);
			}
		}
		return item;
	}
}
