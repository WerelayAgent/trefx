window.addEventListener('DOMContentLoaded', () => {
    const ROBINHOOD_CHAIN_ID = '0x1237';
    const ROBINHOOD_CHAIN_PARAMS = {
        chainId: ROBINHOOD_CHAIN_ID,
        chainName: 'Robinhood Chain',
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: ['https://rpc.robinhood.com'],
        blockExplorerUrls: ['https://explorer.robinhood.com']
    };

    let userAddress = null;

    async function connectWallet(btn) {
        if (!window.ethereum) {
            alert('Please install MetaMask or a Web3 wallet!');
            return;
        }
        try {
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            userAddress = accounts[0];
            
            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: ROBINHOOD_CHAIN_ID }],
                });
            } catch (switchError) {
                if (switchError.code === 4902) {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [ROBINHOOD_CHAIN_PARAMS],
                    });
                } else {
                    console.error(switchError);
                }
            }

            const shortAddress = userAddress.substring(0,6) + '...' + userAddress.substring(userAddress.length-4);
            btn.innerText = shortAddress;
            btn.style.backgroundColor = '#10b981';
            btn.style.color = '#ffffff';

        } catch (err) {
            console.error('Wallet connection failed', err);
        }
    }

    // Since React renders dynamically, use event delegation
    document.body.addEventListener('click', (e) => {
        let el = e.target;
        while(el && el !== document.body) {
            const txt = (el.innerText || '').toLowerCase();
            if (txt.includes('connect') && el.tagName === 'BUTTON') {
                e.preventDefault();
                e.stopPropagation();
                connectWallet(el);
                return;
            }
            // Also check for SVG icon buttons or text nodes that might imply connection
            if (el.tagName === 'BUTTON' && el.querySelector && el.querySelector('svg') && !txt) {
                // heuristic for connect button without text
            }
            el = el.parentElement;
        }
    }, true);
});
