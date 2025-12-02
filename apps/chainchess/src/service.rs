#![cfg_attr(target_arch = "wasm32", no_main)]

mod state;

use std::sync::Arc;

use async_graphql::{EmptySubscription, Request, Response, Schema};
use chainchess::{ChainChessAbi, Operation};
use linera_sdk::{
    graphql::GraphQLMutationRoot as _, linera_base_types::WithServiceAbi, views::View, Service,
    ServiceRuntime,
};
use state::ChainChessState;

pub struct ChainChessService {
    state: Arc<ChainChessState>,
    runtime: Arc<ServiceRuntime<Self>>,
}

linera_sdk::service!(ChainChessService);

impl WithServiceAbi for ChainChessService {
    type Abi = ChainChessAbi;
}

impl Service for ChainChessService {
    type Parameters = ();

    async fn new(runtime: ServiceRuntime<Self>) -> Self {
        let state = ChainChessState::load(runtime.root_view_storage_context())
            .await
            .expect("Failed to load state");
        Self {
            state: Arc::new(state),
            runtime: Arc::new(runtime),
        }
    }

    async fn handle_query(&self, request: Request) -> Response {
        let schema = Schema::build(
            self.state.clone(),
            Operation::mutation_root(self.runtime.clone()),
            EmptySubscription,
        )
        .finish();
        schema.execute(request).await
    }
}
